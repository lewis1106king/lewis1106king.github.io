import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export default function Press({
  children,
  className = '',
  tone = 'primary',
  type = 'button',
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'primary' | 'quiet';
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 520, damping: 28 }}
      className={`press press-${tone} ${className}`}
      onClick={() => {
        if (disabled) return;
        navigator.vibrate?.(10);
        onClick?.();
      }}
    >
      {children}
    </motion.button>
  );
}
