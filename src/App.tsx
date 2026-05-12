import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import ToolRouter from './pages/ToolRouter';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 transition-colors duration-200">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/tool/:toolId" element={<ToolRouter />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
