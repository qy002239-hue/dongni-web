export default function WelcomePage({ onStart, onGoogleLogin }) {
  return (
    <main className="auth-screen welcome-screen">
      <section className="auth-panel welcome-panel animate-fade-in">
        <div className="welcome-brand" aria-label="懂妳 Logo 與名稱">
          <div className="welcome-logo-mark" aria-hidden="true" />
          <div className="welcome-app-name">懂妳</div>
        </div>
        <p className="welcome-tagline">有人願意聽你說。</p>
        <p className="welcome-intro">
          先給妳一個安靜的入口，準備好之後，再慢慢走進這段對話。
        </p>

        <div className="welcome-highlights" aria-label="Welcome Page highlights">
          <article className="welcome-highlight-card">
            <h2>安心開始</h2>
            <p>用最少干擾的畫面，先認識懂妳的陪伴方式。</p>
          </article>
          <article className="welcome-highlight-card">
            <h2>慢慢說也可以</h2>
            <p>不需要一次整理好情緒，準備好了再進入對話。</p>
          </article>
          <article className="welcome-highlight-card">
            <h2>你不用一個人</h2>
            <p>這裡有人陪妳整理心情，隨時都可以開口。</p>
          </article>
        </div>

        <div className="welcome-actions">
          <button onClick={onGoogleLogin} className="auth-primary" type="button">
            使用 Google 登入
          </button>
          <button onClick={onStart} className="auth-secondary" type="button">
            先看看這裡
          </button>
        </div>
      </section>
    </main>
  );
}
