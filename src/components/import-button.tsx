import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from './ui';

export function ImportButton({
  onFile,
  busy,
  label = 'Importa export',
}: {
  onFile: (file: File) => void;
  busy?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload className="size-3.5" />
        {busy ? 'Importazione…' : label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </>
  );
}
