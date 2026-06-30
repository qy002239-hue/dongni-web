export default function WelcomePage({ onStart }) {
  return (
    <main className="auth-screen welcome-screen">
      <section className="auth-panel welcome-panel">
        <div className="welcome-brand" aria-label="懂妳 Logo 與名稱">
          <div className="welcome-logo-placeholder" aria-hidden="true">Logo</div>
          <div className="welcome-app-name">懂妳</div>
        </div>
        <p className="welcome-tagline">有人願意聽你說。</p>
        <h1>Welcome to 懂妳</h1>
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
            <h2>保留既有流程</h2>
            <p>接下來會沿用目前的 onboarding、聲明與登入流程。</p>
          </article>
        </div>

        <button onClick={onStart} className="auth-primary" type="button">
          開始體驗
        </button>
      </section>
    </main>
  );
}
