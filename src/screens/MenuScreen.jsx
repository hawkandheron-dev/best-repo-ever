import styles from './MenuScreen.module.css';

export function MenuScreen({ onSelect }) {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Chess</h1>
      <p className={styles.subtitle}>Choose your game</p>
      <div className={styles.buttons}>
        <button className={styles.btn} onClick={() => onSelect('classic')}>
          <span className={styles.icon}>♟</span>
          <span className={styles.label}>Classic Chess</span>
          <span className={styles.desc}>Standard pass-and-play</span>
        </button>
        <button className={`${styles.btn} ${styles.btnExperiment}`} onClick={() => onSelect('experiment')}>
          <span className={styles.icon}>⬡</span>
          <span className={styles.label}>Experiment</span>
          <span className={styles.desc}>Hex grid · Fog of war · Artifacts</span>
        </button>
        <button className={`${styles.btn} ${styles.btnTest}`} onClick={() => onSelect('test')}>
          <span className={styles.icon}>🧪</span>
          <span className={styles.label}>Test Mode</span>
          <span className={styles.desc}>Experiment + developer options</span>
        </button>
        <button className={`${styles.btn} ${styles.btnSprite}`} onClick={() => onSelect('sprite-studio')}>
          <span className={styles.icon}>🎨</span>
          <span className={styles.label}>Sprite Studio</span>
          <span className={styles.desc}>Pixel art editor · Hex rotations</span>
        </button>
      </div>
    </div>
  );
}
