import { getEnteteConfig } from '../utils/entetesConfig';
import { db } from '../utils/database';
import type { AllConfigs } from '../types/enteteConfig';

interface EnteteFicheProps {
  type: keyof AllConfigs;
  libelle?: string;
  classe?: string;
  enseignant?: string;
}

export default function EnteteFiche({ type, libelle, classe, enseignant }: EnteteFicheProps) {
  const cfg = getEnteteConfig(type);

  // Prefer the global "ecole" record when available (nom / logo), fallback to entete config
  const ecole = db.getAll('ecole')?.[0] as any;
  const leftLogo = (ecole && ecole.logo) ? ecole.logo : (cfg.logo || '');
  const rightLogo = cfg.logoMinistere || '';
  const showRightLogo = rightLogo && rightLogo !== leftLogo;
  const etablissementName = (ecole && ecole.nom) ? ecole.nom : cfg.etablissement;

  return (
    <div className="w-full mb-2">
      <div className="grid grid-cols-[120px_1fr_120px] items-center gap-4 mb-2 print:mb-1">
        <div className="flex flex-col items-start space-y-2">
          {leftLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={leftLogo} alt="logo" style={{ maxHeight: 80, width: 'auto' }} className="logo-left object-contain" />
          ) : (
            <div className="h-16 w-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-600">Logo</div>
          )}
        </div>

        <div className="text-center px-2">
          <div className="text-sm text-gray-700">{cfg.pays}</div>
          <div className="font-bold text-lg tracking-wider text-blue-800">{cfg.ministere}</div>
          <div className="font-extrabold text-xl mt-1">{etablissementName}</div>
          <div className="text-base text-teal-700 mt-1 entete-libelle font-semibold">{libelle || cfg.header}</div>
          {(classe || enseignant) && (
            <div className="text-sm text-gray-600 mt-1">
              {classe && <span className="mr-3">Classe: {classe}</span>}
              {enseignant && <span>Enseignant: {enseignant}</span>}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end space-y-2">
          {showRightLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rightLogo} alt="logo-ministere" style={{ maxHeight: 64, width: 'auto' }} className="logo-right object-contain" />
          ) : (
            // keep space consistent even if no distinct right logo
            <div style={{ height: 64, width: 64 }} />
          )}
        </div>
      </div>

  <div className="text-xs text-right text-gray-600 print:text-xs">{cfg.footer}</div>
    </div>
  );
}
