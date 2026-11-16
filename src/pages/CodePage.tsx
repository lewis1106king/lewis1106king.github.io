import { useRef, useState } from 'react';
import { isJoinCode, normalizeJoinCode } from '../domain/rules';
import Press from '../components/Press';

export default function CodePage({ onBack, onCode }: { onBack: () => void; onCode: (code: string) => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const code = digits.join('');

  const write = (index: number, raw: string) => {
    const cleaned = normalizeJoinCode(raw);
    if (cleaned.length > 1) {
      const next = cleaned.slice(0, 6).split('');
      const filled = ['', '', '', '', '', ''];
      next.forEach((char, i) => { filled[i] = char; });
      setDigits(filled);
      refs.current[Math.min(next.length, 5)]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (cleaned && index < 5) refs.current[index + 1]?.focus();
  };

  return (
    <main className="flow">
      <button className="text-link back" type="button" onClick={onBack}>돌아가기</button>
      <h1>코드를<br />입력하세요.</h1>
      <div className="digits">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => { refs.current[index] = node; }}
            inputMode="text"
            autoCapitalize="characters"
            maxLength={6}
            value={digit}
            aria-label={`코드 ${index + 1}자리`}
            onChange={(event) => write(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus();
            }}
          />
        ))}
      </div>
      <div className="dock single">
        <Press disabled={!isJoinCode(code)} onClick={() => onCode(code)}>다음</Press>
      </div>
    </main>
  );
}
