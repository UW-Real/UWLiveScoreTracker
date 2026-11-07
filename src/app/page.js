"use client";

import AuthCard from "@/components/AuthCard";

export default function Home() {
  return (
    <div className="landing">
      <header className="site-header">
        <a className="brand" href="/" aria-label="UW Score Tracker home">
          <span className="brand-mark" aria-hidden="true">uw.</span>
          <span>Score Tracker</span>
        </a>
        <span className="header-note">A fresh start. A clearer picture.</span>
      </header>
      <main className="landing-main">
        <section className="intro" aria-labelledby="intro-title">
          <p className="eyebrow"><span aria-hidden="true" /> UW SCORE TRACKER</p>
          <h1 id="intro-title">Your scores.<br /><em>One place.</em></h1>
          <p className="intro-description">
            Welcome to UW Score Tracker. Create an account to get started,
            or pick up where you left off.
          </p>
          <a className="intro-link" href="#account">Make yourself at home <span aria-hidden="true">↗</span></a>
          <div className="intro-detail" aria-hidden="true">
            <span className="detail-line" />
            <span>A little less scattered. A little more focused.</span>
          </div>
        </section>
        <AuthCard />
      </main>
      <footer className="site-footer">
        <span>UW Score Tracker</span>
        <span>One score at a time.</span>
      </footer>
    </div>
  );
}
