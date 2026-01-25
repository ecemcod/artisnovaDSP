const axios = require('axios');
const fs = require('fs');

async function extractQobuzCredentials() {
    console.log('🎵 Extrayendo credenciales de Qobuz...\n');

    try {
        // Método 1: Intentar obtener desde el web player
        console.log('1. Obteniendo JavaScript del web player de Qobuz...');
        const webPlayerResponse = await axios.get('https://play.qobuz.com', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // Buscar referencias a archivos JavaScript
        const jsFiles = [];
        const jsRegex = /<script[^>]*src="([^"]*\.js[^"]*)"/g;
        let match;
        while ((match = jsRegex.exec(webPlayerResponse.data)) !== null) {
            if (match[1].includes('app') || match[1].includes('main') || match[1].includes('bundle')) {
                jsFiles.push(match[1].startsWith('http') ? match[1] : `https://play.qobuz.com${match[1]}`);
            }
        }

        console.log(`   Encontrados ${jsFiles.length} archivos JavaScript`);

        // Buscar credenciales en los archivos JS
        for (const jsFile of jsFiles.slice(0, 3)) { // Limitar a los primeros 3 archivos
            try {
                console.log(`   Analizando: ${jsFile.split('/').pop()}`);
                const jsResponse = await axios.get(jsFile, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });

                const jsContent = jsResponse.data;

                // Buscar patrones de app_id y app_secret
                const appIdMatches = [
                    /app_id["\s]*[:=]["\s]*([0-9]+)/gi,
                    /appId["\s]*[:=]["\s]*["]([0-9]+)["]/gi,
                    /["']([0-9]{8,12})["']/g
                ];

                const secretMatches = [
                    /app_secret["\s]*[:=]["\s]*["']([a-f0-9]{32,})["']/gi,
                    /appSecret["\s]*[:=]["\s]*["']([a-f0-9]{32,})["']/gi,
                    /secret["\s]*[:=]["\s]*["']([a-f0-9]{32,})["']/gi
                ];

                let foundAppId = null;
                let foundSecret = null;

                // Buscar app_id
                for (const regex of appIdMatches) {
                    let match;
                    while ((match = regex.exec(jsContent)) !== null) {
                        const candidate = match[1];
                        if (candidate && candidate.length >= 8 && candidate.length <= 12 && /^\d+$/.test(candidate)) {
                            foundAppId = candidate;
                            console.log(`   ✓ App ID encontrado: ${foundAppId}`);
                            break;
                        }
                    }
                    if (foundAppId) break;
                }

                // Buscar app_secret
                for (const regex of secretMatches) {
                    let match;
                    while ((match = regex.exec(jsContent)) !== null) {
                        const candidate = match[1];
                        if (candidate && candidate.length >= 32 && /^[a-f0-9]+$/i.test(candidate)) {
                            foundSecret = candidate;
                            console.log(`   ✓ App Secret encontrado: ${foundSecret.substring(0, 8)}...`);
                            break;
                        }
                    }
                    if (foundSecret) break;
                }

                if (foundAppId && foundSecret) {
                    const config = {
                        appId: foundAppId,
                        appSecret: foundSecret,
                        baseURL: "https://www.qobuz.com/api.json/0.2",
                        timeout: 10000,
                        rateLimit: 500
                    };

                    // Guardar configuración
                    fs.writeFileSync('./qobuz-config.json', JSON.stringify(config, null, 2));
                    console.log('\n✅ Credenciales extraídas y guardadas en qobuz-config.json');
                    
                    // Probar las credenciales
                    await testCredentials(config);
                    return config;
                }

            } catch (error) {
                console.log(`   ⚠ Error analizando ${jsFile.split('/').pop()}: ${error.message}`);
            }
        }

        // Método 2: Credenciales conocidas que funcionan
        console.log('\n2. Probando credenciales conocidas...');
        const knownCredentials = [
            { appId: '285473059', appSecret: null }, // Solo app_id público
            { appId: '950118473', appSecret: null },
            { appId: '846898070', appSecret: null }
        ];

        for (const creds of knownCredentials) {
            console.log(`   Probando app_id: ${creds.appId}`);
            const testConfig = {
                appId: creds.appId,
                appSecret: creds.appSecret,
                baseURL: "https://www.qobuz.com/api.json/0.2",
                timeout: 10000,
                rateLimit: 500
            };

            const works = await testCredentials(testConfig, false);
            if (works) {
                fs.writeFileSync('./qobuz-config.json', JSON.stringify(testConfig, null, 2));
                console.log(`\n✅ Credenciales funcionales guardadas: app_id ${creds.appId}`);
                return testConfig;
            }
        }

        console.log('\n❌ No se pudieron extraer credenciales automáticamente');
        console.log('\n📋 INSTRUCCIONES MANUALES:');
        console.log('1. Ve a https://play.qobuz.com en tu navegador');
        console.log('2. Abre las herramientas de desarrollador (F12)');
        console.log('3. Ve a la pestaña "Network" o "Red"');
        console.log('4. Busca una canción o álbum');
        console.log('5. Busca peticiones a "api.json" en la lista de red');
        console.log('6. Copia el "app_id" de los parámetros de la URL');
        console.log('7. Ejecuta: node extract-qobuz-credentials.js --manual APP_ID');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n📋 MÉTODO MANUAL:');
        console.log('1. Ve a https://play.qobuz.com');
        console.log('2. Abre DevTools (F12) > Network');
        console.log('3. Busca música y copia el app_id de las peticiones API');
        console.log('4. Ejecuta: node extract-qobuz-credentials.js --manual TU_APP_ID');
    }
}

async function testCredentials(config, verbose = true) {
    try {
        if (verbose) console.log('\n🧪 Probando credenciales...');
        
        const QobuzConnector = require('./connectors/QobuzConnector');
        const qobuz = new QobuzConnector(config);
        
        const results = await qobuz.searchArtist('Van Morrison', 1);
        
        if (results && results.length > 0) {
            if (verbose) {
                console.log('✅ ¡Credenciales funcionan!');
                console.log(`   Resultado de prueba: ${results[0].name}`);
            }
            return true;
        } else {
            if (verbose) console.log('❌ Las credenciales no funcionan');
            return false;
        }
    } catch (error) {
        if (verbose) console.log(`❌ Error probando credenciales: ${error.message}`);
        return false;
    }
}

// Método manual
if (process.argv.includes('--manual') && process.argv[3]) {
    const manualAppId = process.argv[3];
    console.log(`🔧 Configurando manualmente con app_id: ${manualAppId}`);
    
    const config = {
        appId: manualAppId,
        baseURL: "https://www.qobuz.com/api.json/0.2",
        timeout: 10000,
        rateLimit: 500
    };

    testCredentials(config).then(works => {
        if (works) {
            fs.writeFileSync('./qobuz-config.json', JSON.stringify(config, null, 2));
            console.log('✅ Configuración manual guardada exitosamente');
        } else {
            console.log('❌ El app_id proporcionado no funciona');
        }
    });
} else {
    // Extracción automática
    extractQobuzCredentials();
}