import React, { useEffect, useState, useRef } from 'react';
import { useStore } from './store';
import axios from 'axios';

// API URL will be set at runtime from config.json

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const subscribeUserToPush = async (publicKey: string) => {
  try {
    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();

    if (existingSubscription) {
      console.log('User is already subscribed.');
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // Send the subscription to the backend
    await axios.post(`${useStore.getState().apiUrl}/subscribe`, subscription);
    console.log('User subscribed successfully.');

  } catch (error) {
    console.error('Failed to subscribe the user: ', error);
  }
};

const setupNotifications = (publicKey: string) => {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('Notification permission granted.');
        subscribeUserToPush(publicKey);
      }
    });
  }
};


// --- Components --- (Copied from previous step for completeness)
interface ButtonProps {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  isLoading?: boolean;
  className?: string;
}

const Button: React.FC<ButtonProps> = ({ onClick, children, isLoading = false, className = '' }) => (
  <button
    onClick={onClick}
    disabled={isLoading}
    className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
  >
    {isLoading ? 'Processing...' : children}
  </button>
);

const LoginScreen = () => {
  const [password, setPassword] = useState('');
  const { login, isLoading, error } = useStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(password);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="w-full max-w-xs">
        <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
          <h1 className="text-2xl font-bold mb-4 text-center">Login</h1>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="******************" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
          </div>
          {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
          <div className="flex items-center justify-between">
            <Button onClick={handleSubmit} isLoading={isLoading}>Sign In</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const MainScreen = () => {
  const { books, fetchBooks, uploadImage, isLoading, error, deleteBook, logout } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  const getCardColor = (dueDate: string) => {
    const due = new Date(dueDate);
    const today = new Date();

    // Reset time part for accurate date-only comparison
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (due < today) {
      return 'bg-red-300'; // Overdue
    }
    if (due.getTime() === tomorrow.getTime()) {
      return 'bg-yellow-300'; // Due tomorrow
    }
    return 'bg-white'; // Default
  };

  const sortedBooks = [...books].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Library Dashboard</h1>
        <Button onClick={() => logout()} className="bg-gray-500 hover:bg-gray-700">Logout</Button>
      </div>
      {error && <p className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">{error}</p>}
      <div className="bg-white shadow-md rounded p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Upload Lending Image</h2>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
        {isLoading && <p className="text-blue-500 mt-2">Uploading and processing image...</p>}
      </div>
      <div>
        <h2 className="text-2xl font-semibold mb-4">Your Books</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedBooks.length > 0 ? (
            sortedBooks.map((book) => (
              <div key={book.bookId} className={`${getCardColor(book.dueDate)} shadow-md rounded p-4 flex flex-col`}>
                <div className="flex-grow">
                  <h3 className="font-bold text-lg">{book.title}</h3>
                  <p className="text-gray-600">Lent on: {book.lendingDate}</p>
                  <p className="text-gray-600 font-semibold">Due on: {book.dueDate}</p>
                </div>
                <button
                  onClick={() => deleteBook(book.bookId)}
                  className="mt-4 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-sm self-end"
                >
                  Delete
                </button>
              </div>
            ))
          ) : (
            <p>No books found. Upload an image to get started!</p>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  const { isAuthenticated, setApiUrl, vapidPublicKey, setVapidPublicKey, checkAuth } = useStore();

  useEffect(() => {
    fetch('/config.json')
      .then((res) => res.json())
      .then((data) => {
        if (data.apiUrl) {
          setApiUrl(data.apiUrl);
        }
        if (data.vapidPublicKey) {
          setVapidPublicKey(data.vapidPublicKey);
        }
        return Promise.resolve();
      })
      .then(() => {
        checkAuth();
      })
      .catch((err) => {
        console.error('Failed to load config.json', err);
        checkAuth();
      });
  }, [setApiUrl, setVapidPublicKey, checkAuth]);

  useEffect(() => {
    if (isAuthenticated && vapidPublicKey) {
      setupNotifications(vapidPublicKey);
    }
  }, [isAuthenticated, vapidPublicKey]);


  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <MainScreen />;
}

export default App;
