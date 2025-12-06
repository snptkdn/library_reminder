import { create } from 'zustand';
import api from './api';
import axios from 'axios';

interface Book {
  bookId: string;
  title: string;
  lendingDate: string;
  dueDate: string;
}

interface AppState {
  isAuthenticated: boolean;
  books: Book[];
  isLoading: boolean;
  error: string | null;
  apiUrl: string;
  vapidPublicKey: string;
  setApiUrl: (url: string) => void;
  setVapidPublicKey: (key: string) => void;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  fetchBooks: () => Promise<void>;
  uploadImage: (file: File) => Promise<void>;
  deleteBook: (bookId: string) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  isAuthenticated: false,
  books: [],
  isLoading: false,
  error: null,
  apiUrl: '',
  vapidPublicKey: '',

  setApiUrl: (url: string) => set({ apiUrl: url }),
  setVapidPublicKey: (key: string) => set({ vapidPublicKey: key }),

  login: async (password: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/login', { username: 'user', password });
      set({ isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ error: 'Login failed. Please check the password.', isAuthenticated: false, isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.post('/logout');
      set({ isAuthenticated: false, books: [], isLoading: false });
    } catch (err) {
      set({ error: 'Logout failed.', isLoading: false });
    }
  },

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.get('/api/me');
      set({ isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isAuthenticated: false, isLoading: false });
    }
  },

  fetchBooks: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<Book[]>('/api/books');
      set({ books: response.data, isLoading: false });
    } catch (err) {
      set({ error: 'Failed to fetch books.', isLoading: false });
    }
  },

  uploadImage: async (file: File) => {
    set({ isLoading: true, error: null });

    const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });

    try {
      const imageBase64 = await toBase64(file);
      await api.post('/api/upload', { image: imageBase64 });
      set({ isLoading: false });
      // After upload, refresh the book list
      useStore.getState().fetchBooks();
    } catch (err) {
      set({ error: 'Failed to upload image.', isLoading: false });
    }
  },

  deleteBook: async (bookId: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/books/${bookId}`);
      set((state) => ({
        books: state.books.filter((book) => book.bookId !== bookId),
        isLoading: false,
      }));
    } catch (err) {
      set({ error: 'Failed to delete book.', isLoading: false });
    }
  },
}));
