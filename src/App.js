import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Dashboard from './pages/Dashboard';
import Deployments from './pages/Deployments';
import NewDeployment from './pages/NewDeployment';
import DeploymentDetail from './pages/DeploymentDetail';
import Login from './pages/Login';
import Register from './pages/Register';
import Navbar from './components/Navbar';
import PrivateRoute from './components/PrivateRoute';
import AuthContext from './context/AuthContext';

// Axios defaults
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function App() {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  
  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
      withCredentials: true,
      autoConnect: false
    });
    
    setSocket(newSocket);
    
    return () => {
      if (newSocket) newSocket.close();
    };
  }, []);
  
  // Connect socket when user is authenticated
  useEffect(() => {
    if (user && socket) {
      socket.connect();
      socket.emit('authenticate', { token: localStorage.getItem('token') });
      
      socket.on('deployment_update', (data) => {
        toast.info(`Deployment ${data.deploymentId} status: ${data.status}`);
      });
      
      socket.on('deployment_removed', (data) => {
        toast.info(`Deployment ${data.deploymentId} has been removed`);
      });
    }
    
    return () => {
      if (socket) {
        socket.off('deployment_update');
        socket.off('deployment_removed');
      }
    };
  }, [user, socket]);
  
  // Check for existing token on initial load
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => setUser(res.data))
      .catch(() => localStorage.removeItem('token'));
    }
  }, []);
  
  return (
    <AuthContext.Provider value={{ user, setUser, socket }}>
      <Router>
        <div className="App">
          <Navbar />
          <div className="container mt-4">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/deployments" element={<PrivateRoute><Deployments /></PrivateRoute>} />
              <Route path="/deployments/new" element={<PrivateRoute><NewDeployment /></PrivateRoute>} />
              <Route path="/deployments/:id" element={<PrivateRoute><DeploymentDetail /></PrivateRoute>} />
            </Routes>
          </div>
          <ToastContainer position="bottom-right" />
        </div>
      </Router>
    </AuthContext.Provider>
  );
}

export default App;
