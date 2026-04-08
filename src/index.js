import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import axios from 'axios';

// Interceptor para solicitudes
axios.interceptors.request.use(
  config => {
    console.log('Solicitud saliente a:', config.url);
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Interceptor para respuestas
axios.interceptors.response.use(
  response => {
    console.log('Respuesta recibida de:', response.config.url);
    return response;
  },
  error => {
    console.error('Error en la solicitud a:', error.config?.url);
    return Promise.reject(error);
  }
);


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
