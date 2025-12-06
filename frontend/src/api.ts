import axios from 'axios';
import { useStore } from './store';

const api = axios.create({
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const apiUrl = useStore.getState().apiUrl;
  if (apiUrl) {
    config.baseURL = apiUrl;
  }
  return config;
});

export default api;
