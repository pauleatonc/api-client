import axios from 'axios';

// Usar variables de entorno para la URL de la API externa (apifile)
const API_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Configuración base de Axios para apifile
 */
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  withCredentials: true
});

/**
 * Interceptor para agregar el token de Keycloak a las peticiones
 */
export const setupApiInterceptors = (token) => {
  apiClient.interceptors.request.use(
    (config) => {
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );
};

/**
 * Función genérica para realizar peticiones GET a apifile
 */
export const fetchFromApifile = async (endpoint, token = null) => {
  try {
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const response = await apiClient.get(endpoint, { headers });
    return response.data;
  } catch (error) {
    console.error(`Error fetching from ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Función genérica para realizar peticiones POST a apifile
 */
export const postToApifile = async (endpoint, data, token = null) => {
  try {
    const response = await axios.get(`${API_URL}/test/`, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      withCredentials: true
    });
    return response.data;
  } catch (error) {
    console.error(`Error posting to ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Función para verificar la salud de la API apifile
 */
export const checkApiHealth = async () => {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    console.error('Error checking API health:', error);
    throw error;
  }
};

export default apiClient; 