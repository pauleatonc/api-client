import React from 'react';

const UserInfoCard = ({ userInfo }) => {
  if (!userInfo) return null;
  
  return (
    <div className="card shadow-sm">
      <div className="card-body">
        <h3 className="card-title h5 mb-3 text-center">Información del Usuario</h3>
        <div className="d-flex flex-column gap-3">
          <div className="row">
            <div className="col-sm-4"><strong>Nombre:</strong></div>
            <div className="col-sm-8">{userInfo.name}</div>
          </div>
          <div className="row">
            <div className="col-sm-4"><strong>RUT:</strong></div>
            <div className="col-sm-8">{userInfo.rut}</div>
          </div>
          <div className="row">
            <div className="col-sm-4"><strong>Email:</strong></div>
            <div className="col-sm-8">{userInfo.email}</div>
          </div>
          <div className="row">
            <div className="col-sm-4"><strong>Usuario:</strong></div>
            <div className="col-sm-8">{userInfo.preferred_username}</div>
          </div>
          <div className="row">
            <div className="col-sm-4"><strong>Email Verificado:</strong></div>
            <div className="col-sm-8">
              <span className={`badge ${userInfo.email_verified ? 'bg-success' : 'bg-warning'}`}>
                {userInfo.email_verified ? 'Sí' : 'No'}
              </span>
            </div>
          </div>
          <div className="row">
            <div className="col-sm-4"><strong>Roles:</strong></div>
            <div className="col-sm-8">
              {userInfo.roles && userInfo.roles.length > 0 ? (
                <div className="d-flex flex-wrap gap-1">
                  {userInfo.roles.map((role, index) => (
                    <span key={index} className="badge bg-primary">{role}</span>
                  ))}
                </div>
              ) : (
                <span className="text-muted">Sin roles asignados</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserInfoCard; 