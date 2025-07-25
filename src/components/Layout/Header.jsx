import React from 'react';
import logo from '../../assets/AndesLogo2.png';

const Header = () => {
  return (
    <div className="align-items-center gap-3 mb-5 justify-content-center">
      <img 
        src={logo} 
        alt="Logo" 
        style={{ height: '200px' }} 
      />
      <h2 className="h4 text-muted mb-0 mt-5 ">Test de integración con Keycloak y API File</h2>
    </div>
  );
};

export default Header; 