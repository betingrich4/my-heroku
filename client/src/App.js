import React, { useState, useEffect, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeContext } from './context/ThemeContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoon, faSun, faCloudUploadAlt, faServer, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';

// Components
import Dashboard from './pages/Dashboard';
import Deployments from './pages/Deployments';
import NewDeployment from './pages/NewDeployment';
import DeploymentDetail from './pages/DeploymentDetail';
import Login from './pages/Login';
import Register from './pages/Register';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import PrivateRoute from './components/PrivateRoute';
import LoadingSpinner from './components/LoadingSpinner';

// Axios defaults
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function App() {
  const { darkMode, toggleDarkMode } = useContext(ThemeContext);
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on initial load
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        setUser(res.data);
        setLoading(false);
      })
      .catch(() => {
        localStorage.removeItem('token');
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (user) {
      const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
        withCredentials: true,
        auth: {
          token: localStorage.getItem('token')
        }
      });
      
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Connected to WebSocket server');
      });

      newSocket.on('deployment_update', (data) => {
        toast.info(
          <div>
            <strong>Deployment Update</strong>
            <p>{data.deploymentId} - Status: {data.status}</p>
            {data.logs && <small>{data.logs}</small>}
          </div>
        );
      });

      newSocket.on('deployment_removed', (data) => {
        toast.info(
          <div>
            <strong>Deployment Removed</strong>
            <p>ID: {data.deploymentId}</p>
          </div>
        );
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    if (socket) socket.disconnect();
    toast.success('Logged out successfully');
  };

  if (loading) {
    return (
      <div className={`app-loading ${darkMode ? 'dark' : 'light'}`}>
        <LoadingSpinner />
        <p>Loading DeployBot...</p>
      </div>
    );
  }

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      <Router>
        {user && (
          <Sidebar>
            <Sidebar.Item 
              icon={<FontAwesomeIcon icon={faServer} />} 
              path="/deployments" 
              text="My Deployments"
            />
            <Sidebar.Item 
              icon={<FontAwesomeIcon icon={faCloudUploadAlt} />} 
              path="/deployments/new" 
              text="New Deployment"
            />
            <Sidebar.Item 
              icon={<FontAwesomeIcon icon={faCog} />} 
              path="/settings" 
              text="Settings"
            />
            <div className="sidebar-footer">
              <button 
                onClick={toggleDarkMode} 
                className="theme-toggle"
                aria-label="Toggle dark mode"
              >
                <FontAwesomeIcon icon={darkMode ? faSun : faMoon} />
              </button>
              <button 
                onClick={handleLogout} 
                className="logout-btn"
                aria-label="Logout"
              >
                <FontAwesomeIcon icon={faSignOutAlt} />
              </button>
            </div>
          </Sidebar>
        )}
        
        <div className="main-content">
          {user && <Navbar user={user} />}
          
          <div className="content-wrapper">
            <Routes>
              <Route 
                path="/login" 
                element={user ? <Navigate to="/" /> : <Login setUser={setUser} />} 
              />
              <Route 
                path="/register" 
                element={user ? <Navigate to="/" /> : <Register setUser={setUser} />} 
              />
              
              <Route path="/" element={<PrivateRoute user={user}><Dashboard /></PrivateRoute>} />
              <Route path="/deployments" element={<PrivateRoute user={user}><Deployments socket={socket} /></PrivateRoute>} />
              <Route path="/deployments/new" element={<PrivateRoute user={user}><NewDeployment /></PrivateRoute>} />
              <Route path="/deployments/:id" element={<PrivateRoute user={user}><DeploymentDetail socket={socket} /></PrivateRoute>} />
            </Routes>
          </div>
        </div>
      </Router>

      <ToastContainer 
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme={darkMode ? 'dark' : 'light'}
      />
    </div>
  );
}

export default App;
