'use client';

import styles from './ExtractingScreen.module.css';

interface ExtractingScreenProps {
  currentStep: number; // 0-3
  steps: string[];
}

export default function ExtractingScreen({ currentStep, steps }: ExtractingScreenProps) {
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className={styles.container}>
      {/* Sparkle Icon */}
      <div className={styles.sparkles}>
        <img src="/sparkle-icon.png" alt="Extracting" className={styles.sparkleImg} />
      </div>

      <h2 className={styles.title}>Extracting...</h2>
      <p className={styles.subtitle}>This may take a while</p>

      {/* Progress */}
      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        <div className={styles.steps}>
          {steps.map((step, i) => {
            const isDone = i < currentStep;
            const isActive = i === currentStep;
            return (
              <div
                key={step}
                className={isDone ? styles.stepDone : isActive ? styles.stepActive : styles.step}
              >
                <div className={isDone ? styles.stepIconDone : isActive ? styles.stepIconActive : styles.stepIconPending}>
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isActive ? (
                    <div className={styles.spinner} />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                {step}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
