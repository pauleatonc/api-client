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
  const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'search'
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

  const handleApiCallClick = useCallback(() => {
    setActiveView('pesticides')
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
                {/* Solo mostrar módulos cuando el usuario esté autenticado */}
                {authenticated && (
                  <div className="col-12 mt-4">
                    <div className="card p-4" style={{ width: '800px'}}>
                      <h2 className="card-title mb-4 text-center">Gestor de archivos</h2>

                      {/* Tabs */}
                      <ul className="nav nav-tabs mb-3">
                        <li className="nav-item">
                          <button
                            className={`nav-link ${activeTab === 'upload' ? 'active' : ''}`}
                            onClick={() => setActiveTab('upload')}
                            type="button"
                          >
                            Subir archivos
                          </button>
                        </li>
                        <li className="nav-item">
                          <button
                            className={`nav-link ${activeTab === 'search' ? 'active' : ''}`}
                            onClick={() => setActiveTab('search')}
                            type="button"
                          >
                            Buscar archivos
                          </button>
                        </li>
                      </ul>

                      {/* Tab content */}
                      <div>
                        {activeTab === 'upload' && (
                          <FileUploader 
                            token={keycloak?.token} 
                            onTokenRefresh={refreshToken}
                            keycloak={keycloak}
                          />
                        )}
                        {activeTab === 'search' && (
                          <div className="mt-3">
                            <FileSearch token={keycloak?.token} keycloak={keycloak} />
                          </div>
                        )}
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