import { useState, useEffect, useCallback } from 'react';
import { initKeycloak, login, logout, extractUserInfo } from '../services/keycloak';
import { setupApiInterceptors } from '../services/api';

export const useAuth = () => {
  const [keycloak, setKeycloak] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState('');
  const [userInfo, setUserInfo] = useState(null);

  // Inicializar Keycloak
  useEffect(() => {
    const initialize = async () => {
      try {
        const { keycloak: keycloakClient, authenticated: authStatus } = await initKeycloak();
        setKeycloak(keycloakClient);
        setAuthenticated(authStatus);
        setIsInitialized(true);
        
        // Si está autenticado, extraer información del usuario
        if (authStatus) {
          const userInfo = extractUserInfo(keycloakClient);
          setUserInfo(userInfo);
          
          // Debug: verificar token
          console.log('AUTH_HOOK: Token presente:', !!keycloakClient.token);
          console.log('AUTH_HOOK: Token expirado:', keycloakClient.isTokenExpired());
          console.log('AUTH_HOOK: Access Token:', keycloakClient.token);
          console.log('AUTH_HOOK: Token decodificado:', JSON.parse(atob(keycloakClient.token.split('.')[1])));
          
          // Configurar interceptores de API con el token de Keycloak
          setupApiInterceptors(keycloakClient.token);
          
          // Configurar renovación automática del token
          setInterval(() => {
            keycloakClient.updateToken(70).then((refreshed) => {
              if (refreshed) {
                console.log('AUTH_HOOK: Token renovado automáticamente');
                setupApiInterceptors(keycloakClient.token);
              }
            }).catch(() => {
              console.log('AUTH_HOOK: Falló la renovación del token');
              setError('Sesión expirada. Por favor, inicia sesión nuevamente.');
            });
          }, 60000); // Verificar cada minuto
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setError('Error al inicializar la autenticación');
        setIsInitialized(true);
      }
    };

    initialize();
  }, []);

  // Función para iniciar sesión
  const handleLogin = useCallback(() => {
    if (keycloak) {
      try {
        login(keycloak).catch(error => {
          console.error('Login error:', error);
          setError('Error al iniciar sesión');
        });
      } catch (error) {
        console.error('Login error:', error);
        setError('Error al iniciar sesión');
      }
    }
  }, [keycloak]);

  // Función para cerrar sesión
  const handleLogout = useCallback(() => {
    if (keycloak) {
      try {
        logout(keycloak).catch(error => {
          console.error('Logout error:', error);
          setError('Error al cerrar sesión');
        });
      } catch (error) {
        console.error('Logout error:', error);
        setError('Error al cerrar sesión');
      }
    }
  }, [keycloak]);

  // Función para renovar el token manualmente
  const refreshToken = useCallback(async () => {
    if (keycloak && authenticated) {
    try {
        const refreshed = await keycloak.updateToken(5);
        if (refreshed) {
          console.log('AUTH_HOOK: Token renovado manualmente');
          setupApiInterceptors(keycloak.token);
          return keycloak.token;
      }
        return keycloak.token;
    } catch (error) {
        console.error('Error refreshing token:', error);
        setError('Error al renovar el token. Por favor, inicia sesión nuevamente.');
      return null;
    }
    }
    return null;
  }, [keycloak, authenticated]);

  return {
    keycloak,
    authenticated,
    isInitialized,
    error,
    userInfo,
    handleLogin,
    handleLogout,
    refreshToken
  };
}; 