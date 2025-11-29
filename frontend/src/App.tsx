import React, { useEffect, useState, useRef } from 'react';
import { useStore } from './store';
import axios from 'axios';
import { BookOpen, Upload, LogIn, Bell, CheckCircle, AlertCircle, Calendar, Clock } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

if (!VAPID_PUBLIC_KEY) {
    console.error("VITE_VAPID_PUBLIC_KEY is not set. Notifications will not work.");
}

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

const subscribeUserToPush = async () => {
    try {
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
            console.log('User is already subscribed.');
            return;
        }

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        await axios.post(`${API_URL}/subscribe`, subscription);
        console.log('User subscribed successfully.');

    } catch (error) {
        console.error('Failed to subscribe the user: ', error);
    }
};

const setupNotifications = () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('Notification permission granted.');
                subscribeUserToPush();
            }
        });
    }
};

// --- Components ---

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    isLoading?: boolean;
    variant?: 'primary' | 'secondary';
}

const Button: React.FC<ButtonProps> = ({ onClick, children, isLoading = false, className = '', variant = 'primary', ...props }) => {
    const baseStyles = "inline-flex items-center justify-center px-6 py-3 border text-base font-medium rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 shadow-sm";
    const variants = {
        primary: "border-transparent text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 shadow-indigo-200",
        secondary: "border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-indigo-500",
    };

    return (
        <button
            onClick={onClick}
            disabled={isLoading}
            className={`${baseStyles} ${variants[variant]} ${isLoading ? 'opacity-70 cursor-not-allowed' : ''} ${className}`}
            {...props}
        >
            {isLoading ? (
                <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                </>
            ) : children}
        </button>
    );
};

const LoginScreen = () => {
    const [password, setPassword] = useState('');
    const { login, isLoading, error } = useStore();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        login(password);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <div className="h-12 w-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                        <BookOpen className="h-8 w-8 text-white" />
                    </div>
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
                    Library Reminder
                </h2>
                <p className="mt-2 text-center text-sm text-slate-600">
                    Sign in to manage your borrowed books
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200 sm:rounded-2xl sm:px-10 border border-slate-100">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                                Password
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="appearance-none block w-full px-3 py-3 border border-slate-300 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                                    placeholder="Enter your access code"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-md bg-red-50 p-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
                                    </div>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-red-800">Login failed</h3>
                                        <div className="mt-2 text-sm text-red-700">
                                            <p>{error}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <Button type="submit" className="w-full" isLoading={isLoading}>
                                <LogIn className="h-5 w-5 mr-2" />
                                Sign in
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

const MainScreen = () => {
    const { books, fetchBooks, uploadImage, isLoading, error } = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchBooks();
        setupNotifications();
    }, [fetchBooks]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            uploadImage(file);
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <nav className="bg-white shadow-sm border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex">
                            <div className="flex-shrink-0 flex items-center gap-2">
                                <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                                    <BookOpen className="h-5 w-5 text-white" />
                                </div>
                                <span className="font-bold text-xl text-slate-900">Library Reminder</span>
                            </div>
                        </div>
                        <div className="flex items-center">
                            <button className="p-2 rounded-full text-slate-400 hover:text-slate-500 hover:bg-slate-100 transition-colors">
                                <Bell className="h-6 w-6" />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
                {error && (
                    <div className="mb-8 rounded-xl bg-red-50 p-4 border border-red-100">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <AlertCircle className="h-5 w-5 text-red-400" />
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-red-800">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Upload */}
                    <div className="lg:col-span-1">
                        <div className="bg-white overflow-hidden shadow-xl shadow-slate-200 rounded-2xl border border-slate-100">
                            <div className="p-6">
                                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                                    <Upload className="h-5 w-5 text-indigo-600" />
                                    New Lending
                                </h2>
                                <p className="text-sm text-slate-500 mb-6">
                                    Upload a photo of your library receipt or book barcode to automatically track your due dates.
                                </p>
                                
                                <div 
                                    onClick={triggerFileInput}
                                    className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer group"
                                >
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        ref={fileInputRef} 
                                        onChange={handleFileChange} 
                                        className="hidden"
                                    />
                                    <div className="mx-auto h-12 w-12 text-slate-400 group-hover:text-indigo-600 transition-colors">
                                        <Upload className="h-full w-full" />
                                    </div>
                                    <p className="mt-2 text-sm font-medium text-slate-900">Click to upload</p>
                                    <p className="mt-1 text-xs text-slate-500">PNG, JPG, GIF up to 10MB</p>
                                </div>

                                {isLoading && (
                                    <div className="mt-4 flex items-center justify-center text-sm text-indigo-600 bg-indigo-50 p-3 rounded-lg">
                                        <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Processing image...
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Books List */}
                    <div className="lg:col-span-2">
                        <div className="bg-white shadow-xl shadow-slate-200 rounded-2xl border border-slate-100 min-h-[500px]">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <BookOpen className="h-5 w-5 text-indigo-600" />
                                    Your Books
                                    <span className="ml-2 bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{books.length}</span>
                                </h2>
                            </div>
                            
                            <div className="p-6">
                                {books.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {books.map((book) => (
                                            <div key={book.bookId} className="group relative bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-indigo-300 transition-all duration-200">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <h3 className="text-base font-semibold text-slate-900 line-clamp-2 mb-2 group-hover:text-indigo-600 transition-colors">
                                                            {book.title}
                                                        </h3>
                                                        <div className="space-y-2">
                                                            <div className="flex items-center text-sm text-slate-500">
                                                                <Calendar className="h-4 w-4 mr-2 text-slate-400" />
                                                                Lent: {book.lendingDate}
                                                            </div>
                                                            <div className="flex items-center text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md w-fit">
                                                                <Clock className="h-4 w-4 mr-2" />
                                                                Due: {book.dueDate}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="ml-4 flex-shrink-0">
                                                        <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <div className="mx-auto h-24 w-24 text-slate-200">
                                            <BookOpen className="h-full w-full" />
                                        </div>
                                        <h3 className="mt-2 text-sm font-medium text-slate-900">No books found</h3>
                                        <p className="mt-1 text-sm text-slate-500">Upload an image to get started tracking your library books.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

function App() {
    const { isAuthenticated } = useStore();

    if (!isAuthenticated) {
        return <LoginScreen />;
    }

    return <MainScreen />;
}

export default App;
