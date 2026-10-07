import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import Home from './pages/Home.jsx';
import ScanReport from './pages/ScanReport.jsx';
import Research from './pages/Research.jsx';
import About from './pages/About.jsx';
import './styles.css';

function Layout({ children }) {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link to="/" className="brand"><span className="brand-mark">✓</span><span className="brand-text">Privacy Gap Scanner</span></Link>
          <nav>
            <NavLink to="/" end>검사</NavLink>
            <NavLink to="/research">실험 결과</NavLink>
            <NavLink to="/about">이용 안내</NavLink>
          </nav>
        </div>
      </header>
      <main className="wrap">{children}</main>
      <footer className="wrap footer">
        본 서비스의 결과는 공개 웹페이지에 대한 기술적 불일치 탐지 결과이며 법률적 판단이 아닙니다. 검토 참고용으로만 사용하세요. · <Link to="/about">이용 안내 및 개인정보 처리</Link>
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scan/:id" element={<ScanReport />} />
          <Route path="/research" element={<Research />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </StrictMode>,
);
