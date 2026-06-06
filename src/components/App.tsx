import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FormulaBar } from './header/FormulaBar';
import { VirtualGrid, VirtualGridHandle } from './VirtualGrid';
import { LiveRegion } from './common/LiveRegion';

export function App() {
  const { t } = useTranslation();
  const gridRef = useRef<VirtualGridHandle>(null);

  useEffect(() => {
    gridRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center border-b border-gray-200 bg-gray-100 px-4 py-2">
        <h1 className="text-sm font-semibold text-gray-800">
          {t('app.title')}
        </h1>
      </header>
      <FormulaBar onCommit={() => gridRef.current?.focus()} />
      <VirtualGrid ref={gridRef} />
      <LiveRegion />
    </div>
  );
}

export default App;
