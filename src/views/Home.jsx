import { useState, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import Header from '../components/Layout/Header'
import Footer from '../components/Layout/Footer'
import UserInfoCard from '../components/UserInfo/UserInfoCard'
import AuthButtons from '../components/Auth/AuthButtons'
import FileUploader from '../components/Api-files/FileUploader'
import FileSearch from '../components/Api-files/FileSearch'

function Home() {
  const [activeView, setActiveView] = useState(null)
  const { 
    keycloak, 
    authenticated, 
    isInitialized, 
    error, 
    userInfo,
    handleLogin, 
    handleLogout,
    refreshToken
  } = useAuth()

  const handleUserInfoClick = useCallback(() => {
    setActiveView('userInfo')
  }, [])

  // Añadir función para el botón de API
  const handleApiCallClick = useCallback(() => {
    // Por ahora, solo cambiar la vista activa
    setActiveView('pesticides')
    // Aquí podrías agregar la lógica para llamar a la API
    console.log('Llamada a API - Función no implementada aún')
  }, [])

  if (!isInitialized) {
    return (
      <div className="vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="d-flex flex-column">
      <div className="container-fluid bg-white py-4 flex-grow-1">
        <div className="row">
          <div className="col-12">
            <Header />
            
            <div className="mt-4">         
              <div className="row justify-content-center mt-4">
                <div className="col-12">
                  {activeView === 'userInfo' && userInfo && (
                    <UserInfoCard userInfo={userInfo} />
                  )}
                </div>                
                {/* Solo mostrar FileUploader cuando el usuario esté autenticado */}
                {authenticated && (
                  <div className="col-12 mt-4">
                    <div className="card p-4">
                      <h2 className="card-title mb-4 text-center">Gestor de archivos</h2>
                                             <FileUploader 
                         token={keycloak?.token} 
                         onTokenRefresh={refreshToken}
                         keycloak={keycloak}
                       />

                       <div className="mt-4">
                         <h3 className="mb-3">Buscar y descargar archivos</h3>
                         <FileSearch token={keycloak?.token} keycloak={keycloak} />
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="row justify-content-center">
              <div className="col-12 col-md-8">
                {error && <p className="text-danger mb-4">{error}</p>}
                {!error && authenticated && <p className="text-success mb-4">Sesión iniciada correctamente</p>}
                
                <div className="d-flex justify-content-center">
                  <AuthButtons 
                    authenticated={authenticated}
                    handleLogin={handleLogin}
                    handleLogout={handleLogout}
                    activeView={activeView}
                    onUserInfoClick={handleUserInfoClick}
                    onApiCallClick={handleApiCallClick}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default Home 