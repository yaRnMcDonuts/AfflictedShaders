#import "Common/ShaderLib/GLSLCompat.glsllib"
#import "Common/ShaderLib/PBR.glsllib"
#import "Common/ShaderLib/Parallax.glsllib"
#import "Common/ShaderLib/Lighting.glsllib"
#import "MatDefs/ShaderLib/AfflictionLib.glsllib"



#ifdef AFFLICTIONTEXTURE
    uniform sampler2D m_AfflictionTexture;
#endif

uniform int m_PlaguedMapScale;
#ifdef PLAGUEDALBEDOMAP
    uniform sampler2D m_PlaguedAlbedoMap;
#endif

#ifdef PLAGUEDNORMALMAP
    uniform sampler2D m_PlaguedNormalMap;
#endif

#ifdef PLAGUEDROUGHNESSMETALLICMAP
    uniform sampler2D m_PlaguedRoughnessMetallicMap;
#endif

#ifdef TILEWIDTH
    uniform float m_TileWidth;
#endif

#ifdef TILELOCATION
    uniform vec3 m_TileLocation;
#endif


varying vec2 texCoord;
#ifdef SEPARATE_TEXCOORD
  varying vec2 texCoord2;
#endif

varying vec4 Color;

uniform vec4 g_LightData[NB_LIGHTS];

uniform vec3 g_CameraPosition;

uniform float m_Roughness;
uniform float m_Metallic;

varying vec3 wPosition;    




#ifdef INDIRECT_LIGHTING
//  uniform sampler2D m_IntegrateBRDF;
  uniform samplerCube g_PrefEnvMap;
  uniform vec3 g_ShCoeffs[9];
  uniform vec4 g_LightProbeData;
#endif

#ifdef BASECOLORMAP
  uniform sampler2D m_BaseColorMap;
#endif

#ifdef USE_PACKED_MR
     uniform sampler2D m_MetallicRoughnessMap;
#else
    #ifdef METALLICMAP
      uniform sampler2D m_MetallicMap;
    #endif
    #ifdef ROUGHNESSMAP
      uniform sampler2D m_RoughnessMap;
    #endif
#endif

#ifdef EMISSIVE
    uniform vec4 m_Emissive;
#endif
#ifdef EMISSIVEMAP
    uniform sampler2D m_EmissiveMap;
#endif
#if defined(EMISSIVE) || defined(EMISSIVEMAP)
    uniform float m_EmissivePower;
    uniform float m_EmissiveIntensity;
#endif 

#ifdef SPECGLOSSPIPELINE

  uniform vec4 m_Specular;
  uniform float m_Glossiness;
  #ifdef USE_PACKED_SG
    uniform sampler2D m_SpecularGlossinessMap;
  #else
    uniform sampler2D m_SpecularMap;
    uniform sampler2D m_GlossinessMap;
  #endif
#endif

#ifdef PARALLAXMAP
  uniform sampler2D m_ParallaxMap;  
#endif
#if (defined(PARALLAXMAP) || (defined(NORMALMAP_PARALLAX) && defined(NORMALMAP)))
    uniform float m_ParallaxHeight;
#endif

#ifdef LIGHTMAP
  uniform sampler2D m_LightMap;
#endif
  
#if defined(NORMALMAP) || defined(PARALLAXMAP)
  uniform sampler2D m_NormalMap;   
 
#endif
 varying vec4 wTangent;

varying vec3 wNormal;

#ifdef DISCARD_ALPHA
uniform float m_AlphaDiscardThreshold;
#endif

vec3 blending;






invariant float brightestPointLight = 1.0;
 // IMPORTANT IDEA: after scaling down based on indoor vert colors and the actual time of day, scale BACK UP for anything near a point light (as an indoor light should increase illumination from lightprobe brighter)
  

#if defined(USE_VERTEX_COLORS_AS_SUN_INTENSITY)
    varying vec4 vertColors;
#endif

#ifdef STATIC_SUN_INTENSITY
    uniform float m_StaticSunIntensity;
#endif

#ifdef PROBE_COLOR
    uniform vec4 m_ProbeColor;
#endif

void main(){
    
    
    float indoorSunLightExposure = 1.0;//scale this to match R channel of vertex colors

    vec3 probeColorMult = vec3(1.0);
    float timeOfDayScale = 1.0;
    #ifdef PROBE_COLOR
            timeOfDayScale = m_ProbeColor.w; // time of day is stored in alpha value of the ProbeColor vec4. this way the rgb vec3 can be used for scaling probe color
            probeColorMult = m_ProbeColor.xyz;
     #endif
                    


    //init blending variable incase plague map needs splatted on vertical walls, hence the need for triplanar mapping 
    #ifdef USE_TRIPLANAR_PLAGUE_MAPPING
        blending = abs( wNormal );
                blending = (blending -0.2) * 0.7;
                blending = normalize(max(blending, 0.00001));      // Force weights to sum to 1.0 (very important!)
                float b = (blending.x + blending.y + blending.z);
                blending /= vec3(b, b, b);
    #endif

    vec2 newTexCoord;
    vec3 viewDir = normalize(g_CameraPosition - wPosition);

    vec3 norm = normalize(wNormal);
    #if defined(NORMALMAP) || defined(PARALLAXMAP) || defined(PLAGUEDNORMALMAP)
        vec3 tan = normalize(wTangent.xyz);
        mat3 tbnMat = mat3(tan, wTangent.w * cross( (norm), (tan)), norm);
    #endif

    #if (defined(PARALLAXMAP) || (defined(NORMALMAP_PARALLAX) && defined(NORMALMAP)))
       vec3 vViewDir =  viewDir * tbnMat;  
       #ifdef STEEP_PARALLAX
           #ifdef NORMALMAP_PARALLAX
               //parallax map is stored in the alpha channel of the normal map         
               newTexCoord = steepParallaxOffset(m_NormalMap, vViewDir, texCoord, m_ParallaxHeight);
           #else
               //parallax map is a texture
               newTexCoord = steepParallaxOffset(m_ParallaxMap, vViewDir, texCoord, m_ParallaxHeight);         
           #endif
       #else
           #ifdef NORMALMAP_PARALLAX
               //parallax map is stored in the alpha channel of the normal map         
               newTexCoord = classicParallaxOffset(m_NormalMap, vViewDir, texCoord, m_ParallaxHeight);
           #else
               //parallax map is a texture
               newTexCoord = classicParallaxOffset(m_ParallaxMap, vViewDir, texCoord, m_ParallaxHeight);
           #endif
       #endif
    #else
       newTexCoord = texCoord;    
    #endif
    
    #ifdef BASECOLORMAP
        vec4 albedo = texture2D(m_BaseColorMap, newTexCoord) * Color;
    #else
        vec4 albedo = Color;
    #endif

    float alpha = albedo.a;



    vec4 afflictionVector = vec4(1.0, 0.0, 0.0, 0.0);

    #if defined(AFFLICTIONTEXTURE) && defined(TILEWIDTH) && defined(TILELOCATION)
        vec2 tileCoords;
        float xPos, zPos;

        vec3 locInTile = (wPosition - m_TileLocation);

         locInTile += vec3(m_TileWidth/2, 0, m_TileWidth/2);

         xPos = (locInTile.x / m_TileWidth);
         zPos = 1 - (locInTile.z / m_TileWidth);
        
        tileCoords = vec2(xPos, zPos);

        afflictionVector = texture2D(m_AfflictionTexture, tileCoords).rgba;

    #endif

    float livelinessValue = afflictionVector.r;
    float plaguedValue = afflictionVector.g;
//    float plagueddValue = afflictionVector.g; // idea maybe? 
//    float windValue = afflictionVector.b; // idea maybe? 


  
float deathVar = (1.0 - (livelinessValue));

    albedo = alterStoneLiveliness(albedo, livelinessValue);


    

    

    #ifdef USE_PACKED_MR
        vec2 rm = texture2D(m_MetallicRoughnessMap, newTexCoord).gb;
        float Roughness = rm.x * max(m_Roughness, 1e-4);
        float Metallic = rm.y * max(m_Metallic, 0.0);
    #else
        #ifdef ROUGHNESSMAP
            float Roughness = texture2D(m_RoughnessMap, newTexCoord).r * max(m_Roughness, 1e-4);
        #else
            float Roughness =  max(m_Roughness, 1e-4);
        #endif
        #ifdef METALLICMAP
            float Metallic = texture2D(m_MetallicMap, newTexCoord).r * max(m_Metallic, 0.0);
        #else
            float Metallic =  max(m_Metallic, 0.0);
        #endif
    #endif
 

    #ifdef DISCARD_ALPHA
        if(alpha < m_AlphaDiscardThreshold){
            discard;
        }
    #endif
 

    // ***********************
    // Read from textures
    // ***********************
    #if defined(NORMALMAP)
      vec4 normalHeight = texture2D(m_NormalMap, newTexCoord);
      //Note the -2.0 and -1.0. We invert the green channel of the normal map, 
      //as it's complient with normal maps generated with blender.
      //see http://hub.jmonkeyengine.org/forum/topic/parallax-mapping-fundamental-bug/#post-256898
      //for more explanation.
      vec3 normal = normalize((normalHeight.xyz * vec3(2.0, NORMAL_TYPE * 2.0, 2.0) - vec3(1.0, NORMAL_TYPE * 1.0, 1.0)));
      normal = normalize(normal *  inverse(tbnMat));
    #else
      vec3 normal = norm;
    #endif

   //APPLY PLAGUEDNESS TO THE PIXEL

 float noiseHash = getStaticNoiseVar0(wPosition, plaguedValue);

    vec4 plaguedAlbedo;    
    vec2 newScaledCoords;
    float newPlagueScale = m_PlaguedMapScale;

    #ifdef PLAGUEDALBEDOMAP
         #ifdef USE_TRIPLANAR_PLAGUE_MAPPING

            newPlagueScale = newPlagueScale / 256;
            plaguedAlbedo = getTriPlanarBlend(vec4(wPosition, 1.0), blending, m_PlaguedAlbedoMap, newPlagueScale);

         #else
            newScaledCoords = mod(wPosition.xz / m_PlaguedMapScale, 1);
            plaguedAlbedo = texture2D(m_PlaguedAlbedoMap, newScaledCoords);
         #endif
        
        
    #else
        plaguedAlbedo = vec4(0.55, 0.8, 0.00, 1.0);
    #endif

    vec3 plaguedNormal;
    #ifdef PLAGUEDNORMALMAP
        #ifdef USE_TRIPLANAR_PLAGUE_MAPPING
            plaguedNormal = getTriPlanarBlend(vec4(wPosition, 1.0), blending, m_PlaguedNormalMap, newPlagueScale).rgb;
        #else
           plaguedNormal = texture2D(m_PlaguedNormalMap, newScaledCoords).rgb;
        #endif
        
        plaguedNormal = normalize((plaguedNormal.xyz * vec3(2.0, NORMAL_TYPE * 2.0, 2.0) - vec3(1.0, NORMAL_TYPE * 1.0, 1.0)));

         
    #else
        plaguedNormal = norm; 

    #endif

    vec4 plaguedGlowColor = vec4(0.87, 0.95, 0.1, 1.0);

        #ifdef NORMALMAP
            plaguedNormal = normalize(plaguedNormal *  inverse(tbnMat));
            normal = alterPlaguedNormals(plaguedValue, normal, plaguedNormal, noiseHash);

            
        #else

            plaguedNormal *= plaguedValue;
            normal = normalize(norm + plaguedNormal);

      #endif

   
    Roughness = alterPlaguedRoughness(plaguedValue, Roughness, 0.753, noiseHash * plaguedAlbedo.a);
    Metallic = alterPlaguedMetallic(plaguedValue, Metallic,  0.2, noiseHash * plaguedAlbedo.a);//use the alpha channel of albedo map to alter opcaity for the matching plagued normals, roughness, and metalicness at each pixel
    albedo = alterPlaguedColor(plaguedValue, albedo, plaguedAlbedo, noiseHash * plaguedAlbedo.a);
   
    plaguedGlowColor = alterPlaguedGlow(plaguedValue, plaguedGlowColor, noiseHash);


    plaguedGlowColor = vec4(0);

    alpha = max(albedo.a, alpha);

    

    float specular = 0.5;
    #ifdef SPECGLOSSPIPELINE

        #ifdef USE_PACKED_SG
            vec4 specularColor = texture2D(m_SpecularGlossinessMap, newTexCoord);
            float glossiness = specularColor.a * m_Glossiness;
            specularColor *= m_Specular;
        #else
            #ifdef SPECULARMAP
                vec4 specularColor = texture2D(m_SpecularMap, newTexCoord);
            #else
                vec4 specularColor = vec4(1.0);
            #endif
            #ifdef GLOSSINESSMAP
                float glossiness = texture2D(m_GlossinesMap, newTexCoord).r * m_Glossiness;
            #else
                float glossiness = m_Glossiness;
            #endif
            specularColor *= m_Specular;
        #endif
        vec4 diffuseColor = albedo;// * (1.0 - max(max(specularColor.r, specularColor.g), specularColor.b));
        Roughness = 1.0 - glossiness;
    #else      
        float nonMetalSpec = 0.08 * specular;
        vec4 specularColor = (nonMetalSpec - nonMetalSpec * Metallic) + albedo * Metallic;
        vec4 diffuseColor = albedo - albedo * Metallic;
    #endif

    gl_FragColor.rgb = vec3(0.0);
    vec3 ao = vec3(1.0);

    #ifdef LIGHTMAP
       vec3 lightMapColor;
       #ifdef SEPARATE_TEXCOORD
          lightMapColor = texture2D(m_LightMap, texCoord2).rgb;
       #else
          lightMapColor = texture2D(m_LightMap, texCoord).rgb;
       #endif
       #ifdef AO_MAP
         lightMapColor.gb = lightMapColor.rr;
         ao = lightMapColor;
       #else
         gl_FragColor.rgb += diffuseColor.rgb * lightMapColor;
       #endif
       specularColor.rgb *= lightMapColor;
    #endif

    ao = alterPlaguedAo(plaguedValue, ao, vec3(1.0), noiseHash); // alter the AO map for plagued values
    
    
  //SUN EXPOSURE AND TIME OF DAY
    float factoredTimeOfDayScale = timeOfDayScale;
    #ifdef STATIC_SUN_INTENSITY
        indoorSunLightExposure = m_StaticSunIntensity;
        brightestPointLight = 0.0;
    #endif
    #ifdef USE_VERTEX_COLORS_AS_SUN_INTENSITY
        indoorSunLightExposure = vertColors.r * indoorSunLightExposure;             //use R channel of vertexColors... *^.
        brightestPointLight = 0.0;
    #endif
    
    
    
    factoredTimeOfDayScale *= indoorSunLightExposure;  //timeOfDayScale (aka a float to scale lightProbe at night vs day) is only as effective as the indooSunLightExposure
                                                           //it will be 
     

    float ndotv = max( dot( normal, viewDir ),0.0);
    for( int i = 0;i < NB_LIGHTS; i+=3){
        vec4 lightColor = g_LightData[i];
        vec4 lightData1 = g_LightData[i+1];                
        vec4 lightDir;
        vec3 lightVec;            
        lightComputeDir(wPosition, lightColor.w, lightData1, lightDir, lightVec);

        float fallOff = 1.0;
        #if __VERSION__ >= 110
            // allow use of control flow
        if(lightColor.w > 1.0){
        #endif
            fallOff =  computeSpotFalloff(g_LightData[i+2], lightVec);
        #if __VERSION__ >= 110
        }
        #endif
        //point light attenuation
        fallOff *= lightDir.w;

        lightDir.xyz = normalize(lightDir.xyz);            
        vec3 directDiffuse;
        vec3 directSpecular;
        
        PBR_ComputeDirectLight(normal, lightDir.xyz, viewDir,
                            lightColor.rgb,specular, Roughness, ndotv,
                            directDiffuse,  directSpecular);

        vec3 directLighting = diffuseColor.rgb *directDiffuse + directSpecular;
        
     //   #if defined(USE_VERTEX_COLORS_AS_SUN_INTENSITY) || defined(STATIC_SUN_INTENSITY)
            
            if(fallOff == 1.0 || fallOff == 0.0){
                directLighting.rgb *= indoorSunLightExposure;// ... *^. to scale down how intense just the sun is (ambient and direct light are 1.0 fallOff)
                
            }
            else{
              //      brightestPointLight = fallOff;
          
           }
   //     #endif
        
        
        
        gl_FragColor.rgb += directLighting * fallOff;
        
     
    }
    
    
    float minVertLighting;
    #ifdef BRIGHTEN_INDOOR_SHADOWS
        minVertLighting = 0.0833; //brighten shadows so that caves which are naturally covered from the DL shadows are not way too dark compared to when shadows are off
    #else
        minVertLighting = 0.0533;
    
    #endif
    
    
    factoredTimeOfDayScale = max(factoredTimeOfDayScale, minVertLighting); //essentially just the vertColors.r (aka indoor liht exposure) multiplied by the time of day scale.
    
    

    #ifdef INDIRECT_LIGHTING
        vec3 rv = reflect(-viewDir.xyz, normal.xyz);
        //prallax fix for spherical bounds from https://seblagarde.wordpress.com/2012/09/29/image-based-lighting-approaches-and-parallax-corrected-cubemap/
        // g_LightProbeData.w is 1/probe radius + nbMipMaps, g_LightProbeData.xyz is the position of the lightProbe.

        float invRadius = fract( g_LightProbeData.w );
        float nbMipMaps = g_LightProbeData.w - invRadius;
        rv = invRadius * (wPosition - g_LightProbeData.xyz) +rv;

         //horizon fade from http://marmosetco.tumblr.com/post/81245981087
        float horiz = dot(rv , norm);
        float horizFadePower = 1.0 - Roughness;
        horiz = clamp( 1.0 + horizFadePower * horiz, 0.0, 1.0 );
        horiz *= horiz;

        vec3 indirectDiffuse = vec3(0.0);
        vec3 indirectSpecular = vec3(0.0);
        indirectDiffuse = sphericalHarmonics(normal.xyz, g_ShCoeffs) * diffuseColor.rgb;
        vec3 dominantR = getSpecularDominantDir( normal, rv.xyz, Roughness*Roughness ) ;
        indirectSpecular = ApproximateSpecularIBLPolynomial(g_PrefEnvMap, specularColor.rgb , Roughness, ndotv, dominantR, nbMipMaps);
        indirectSpecular *= vec3(horiz);
        
        vec3 indirectLighting = (indirectDiffuse  + indirectSpecular) * probeColorMult * ao * factoredTimeOfDayScale;  //multiply the probeColor and time of day scale by final inderectLighting value from lightProbe

        gl_FragColor.rgb = gl_FragColor.rgb + indirectLighting  * step( 0.0, g_LightProbeData.w ) ;
    #endif
 
    #if defined(EMISSIVE) || defined (EMISSIVEMAP)
        #ifdef EMISSIVEMAP
            vec4 emissive = texture2D(m_EmissiveMap, newTexCoord);
        #else
            vec4 emissive = m_Emissive;
        #endif
        
        if(livelinessValue > 0.1){
            emissive *= livelinessValue *livelinessValue;

        }
        else{ //ignore the base emissiveMap for texture below half death
            emissive *= .01;
        }


        gl_FragColor += emissive * pow(emissive.a, m_EmissivePower) * m_EmissiveIntensity;
    #endif
    

  gl_FragColor.a = alpha;
}