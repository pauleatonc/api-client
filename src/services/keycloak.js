import Keycloak from 'keycloak-js';
import axios from 'axios';

/**
 * Inicializa y configura el cliente Keycloak según el ambiente actual
 */
export const initKeycloak = async () => {
  try {
    // Determinar el ambiente: DEV o LOCAL
    const env = import.meta.env.VITE_ENV || 'DEV';
    
    console.log(`Ambiente de Keycloak: ${env}`);
    
    // Asegurarse de que la URL base incluya /auth/
    const keycloakBaseUrl = import.meta.env[`VITE_KEYCLOAK_URL_${env}`] || 'https://ssotest.apps.ocp4.contraloria.cl';
    const formattedUrl = keycloakBaseUrl.endsWith('/') 
      ? `${keycloakBaseUrl}auth` 
      : `${keycloakBaseUrl}/auth`;
    
    console.log(`URL Keycloak: ${formattedUrl}`);
    console.log(`Realm: ${import.meta.env[`VITE_KEYCLOAK_REALM_${env}`]}`);
    console.log(`ClientID: ${import.meta.env[`VITE_KEYCLOAK_CLIENT_ID_${env}`]}`);
    
    const keycloakConfig = {
      url: formattedUrl,
      realm: import.meta.env[`VITE_KEYCLOAK_REALM_${env}`] || 'master',
      clientId: import.meta.env[`VITE_KEYCLOAK_CLIENT_ID_${env}`] || 'api-front-client'
    };

    console.log('Configuración de Keycloak:', keycloakConfig);

    const keycloakClient = new Keycloak(keycloakConfig);

    await keycloakClient.init({
      onLoad: null,
      pkceMethod: 'S256',
      checkLoginIframe: false,
      redirectUri: window.location.origin
    });

    // Configurar interceptor de Axios para tokens
    setupAxiosInterceptors(keycloakClient);

    return {
      keycloak: keycloakClient,
      authenticated: keycloakClient.authenticated || false
    };
  } catch (error) {
    console.error('Keycloak init error:', error);
    throw error;
  }
};

/**
 * Configura los interceptores de Axios para incluir el token en las peticiones
 */
const setupAxiosInterceptors = (keycloakClient) => {
  axios.interceptors.request.use(
    (config) => {
      if (keycloakClient.authenticated && keycloakClient.token) {
        config.headers.Authorization = `Bearer ${keycloakClient.token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
};

/**
 * Inicia sesión en Keycloak
 */
export const login = (keycloak) => {
  if (keycloak) {
    return keycloak.login({
      redirectUri: window.location.origin,
      scope: 'openid profile email'
    });
  }
  return Promise.reject('Keycloak no inicializado');
};

/**
 * Cierra sesión en Keycloak
 */
export const logout = (keycloak) => {
  if (keycloak) {
    return keycloak.logout({
      redirectUri: window.location.origin
    });
  }
  return Promise.reject('Keycloak no inicializado');
};

/**
 * Extrae información del usuario desde el token
 */
export const extractUserInfo = (keycloak) => {
  if (!keycloak || !keycloak.tokenParsed) {
    return null;
  }
  
  const tokenData = keycloak.tokenParsed;
  
  return {
    name: tokenData.name || 'No disponible',
    email: tokenData.email || 'No disponible',
    rut: tokenData.rut_numero && tokenData.rut_dv 
      ? `${tokenData.rut_numero}-${tokenData.rut_dv}` 
      : 'No disponible',
    email_verified: tokenData.email_verified || false,
    preferred_username: tokenData.preferred_username || 'No disponible',
    roles: keycloak.realmAccess?.roles || []
  };
}; 