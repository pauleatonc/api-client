import React from 'react';
import logoAndes from '../../assets/AndesLogo.svg';

const Footer = () => {
  return (
    <footer className="bg-light py-3 mt-5">
      <div className="container text-center">
        <div className="d-flex justify-content-center align-items-center gap-2">
          <span className="text-muted">Desarrollado por</span>
          <img 
            src={logoAndes} 
            alt="Andes Digital Logo" 
            style={{ height: '30px', filter: 'brightness(0)' }} 
          />
        </div>
      </div>
    </footer>
  );
};

export default Footer; 