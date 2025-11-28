import { create } from 'zustand';
import axios from 'axios';

// APIのベースURLを環境変数から取得するか、デフォルト値を設定
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

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
  login: (password: string) => Promise<void>;
  fetchBooks: () => Promise<void>;
  uploadImage: (file: File) => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  isAuthenticated: false,
  books: [],
  isLoading: false,
  error: null,

  login: async (password: string) => {
    set({ isLoading: true, error: null });
    try {
      // ユーザー名はハードコードされているので、パスワードだけ送信
      await axios.post(`${API_URL}/login`, { username: 'user', password });
      set({ isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ error: 'Login failed. Please check the password.', isAuthenticated: false, isLoading: false });
    }
  },

  fetchBooks: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axios.get<Book[]>(`${API_URL}/books`);
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
      await axios.post(`${API_URL}/upload`, { image: imageBase64 });
      set({ isLoading: false });
      // After upload, refresh the book list
      useStore.getState().fetchBooks();
    } catch (err) {
      set({ error: 'Failed to upload image.', isLoading: false });
    }
  },
}));
