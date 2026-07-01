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

        <div className="welcome-features" aria-label="懂妳的四個特色">
          <article className="welcome-feature-card">
            <span className="welcome-feature-icon" aria-hidden="true">🌿</span>
            <h2>陪伴</h2>
            <p>不用急著振作，也不用急著找到答案。</p>
          </article>
          <article className="welcome-feature-card">
            <span className="welcome-feature-icon" aria-hidden="true">🌊</span>
            <h2>傾聽</h2>
            <p>你可以慢慢說，我會一直在。</p>
          </article>
          <article className="welcome-feature-card">
            <span className="welcome-feature-icon" aria-hidden="true">🤍</span>
            <h2>接住</h2>
            <p>不評價，不說教，不否定。</p>
          </article>
          <article className="welcome-feature-card">
            <span className="welcome-feature-icon" aria-hidden="true">🔒</span>
            <h2>安全</h2>
            <p>你的對話，只屬於你。</p>
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
