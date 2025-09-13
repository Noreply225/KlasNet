import { useState, useMemo, useEffect } from 'react';
import { db } from '../../utils/database';
import { Eleve, Classe, Matiere, Note, CompositionConfig, MoyenneEleve } from '../../types';
import { useToast } from '../Layout/ToastProvider';
import { Save, BookOpen, Users, Calculator, Trophy, Target } from 'lucide-react';

export default function NotesParClasse() {
  const { showToast } = useToast();
  const [selectedClasseId, setSelectedClasseId] = useState('');
  const [selectedComposition, setSelectedComposition] = useState('');
  const [notes, setNotes] = useState<Record<string, Record<string, number>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [moyenneBase, setMoyenneBase] = useState<10 | 20>(20);

  const classes = db.getAll<Classe>('classes');
  const compositions = db.getAll<CompositionConfig>('compositions');
  const allNotes = db.getAll<Note>('notes');

  const selectedClasse = classes.find(c => c.id === selectedClasseId);
  const elevesClasse = db.getAll<Eleve>('eleves').filter(e => 
    e.classeId === selectedClasseId && e.statut === 'Actif'
  ).sort((a, b) => a.nom.localeCompare(b.nom));

  // Compositions pour le niveau de la classe sélectionnée
  const compositionsNiveau = useMemo(() => {
    if (!selectedClasse) return compositions;
    return compositions.filter(c => 
      !c.niveau || c.niveau === selectedClasse.niveau
    ).sort((a, b) => a.ordre - b.ordre);
  }, [selectedClasse, compositions]);

  // Matières de la classe sélectionnée
  const matieresClasse = useMemo(() => {
    if (!selectedClasse) return [];
    return (selectedClasse.matieres || []).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [selectedClasse]);

  // Charger les notes existantes
  useEffect(() => {
    if (!selectedComposition || !selectedClasseId) return;
    
    const notesExistantes: Record<string, Record<string, number>> = {};
    elevesClasse.forEach(eleve => {
      notesExistantes[eleve.id] = {};
      matieresClasse.forEach(matiere => {
        const note = allNotes.find(n => 
          n.eleveId === eleve.id && 
          n.matiereId === matiere.id && 
          n.compositionId === selectedComposition &&
          n.classeId === selectedClasseId
        );
        if (note) {
          notesExistantes[eleve.id][matiere.id] = note.valeur;
        }
      });
    });
    setNotes(notesExistantes);
  }, [selectedComposition, selectedClasseId, elevesClasse, matieresClasse, allNotes]);

  // Open notes entry from dashboard shortcut
  useEffect(() => {
    const onOpenNotes = () => {
      if (!selectedClasseId && classes.length > 0) {
        setSelectedClasseId(classes[0].id);
      }
      if (!selectedComposition && compositionsNiveau.length > 0) {
        setSelectedComposition(compositionsNiveau[0].id);
      }
    };
    window.addEventListener('open-notes-entry', onOpenNotes as EventListener);
    return () => window.removeEventListener('open-notes-entry', onOpenNotes as EventListener);
  }, [selectedClasseId, selectedComposition, classes, compositionsNiveau]);

  const handleNoteChange = (eleveId: string, matiereId: string, valeur: number) => {
    setNotes(prev => ({
      ...prev,
      [eleveId]: {
        ...prev[eleveId],
        [matiereId]: valeur
      }
    }));
  };

  const getBaremeMatiere = (matiere: Matiere, niveau: string): number => {
    return matiere.baremeParNiveau?.[niveau]?.max || 20;
  };

  const calculateTotal = (eleveId: string): number => {
    if (!notes[eleveId]) return 0;
    return matieresClasse.reduce((total, matiere) => {
      const note = notes[eleveId][matiere.id] || 0;
      return total + note;
    }, 0);
  };

  const calculateMoyenne = (eleveId: string): number => {
    if (!notes[eleveId] || !selectedClasse) return 0;
    
    let totalPoints = 0;
    let totalPossible = 0;

    matieresClasse.forEach(matiere => {
      const note = notes[eleveId][matiere.id] || 0;
      const bareme = getBaremeMatiere(matiere, selectedClasse.niveau);
      
      // Convertir la note selon la base de moyenne choisie
      const noteConvertie = moyenneBase === 20 
        ? (note / bareme) * 20 
        : (note / bareme) * 10;
      
      totalPoints += noteConvertie * matiere.coefficient;
      totalPossible += moyenneBase * matiere.coefficient;
    });

    return totalPossible > 0 ? (totalPoints / totalPossible) * moyenneBase : 0;
  };

  const calculateRang = (eleveId: string): number => {
    const moyenneEleve = calculateMoyenne(eleveId);
    const moyennes = elevesClasse.map(e => ({
      eleveId: e.id,
      moyenne: calculateMoyenne(e.id)
    })).filter(m => m.moyenne > 0);

    moyennes.sort((a, b) => b.moyenne - a.moyenne);
    const rang = moyennes.findIndex(m => m.eleveId === eleveId) + 1;
    return rang || 0;
  };

  const handleSaveNotes = async () => {
    if (!selectedComposition || !selectedClasseId) {
      showToast('Sélectionnez une classe et une composition', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // Sauvegarder toutes les notes
      Object.entries(notes).forEach(([eleveId, notesEleve]) => {
        Object.entries(notesEleve).forEach(([matiereId, valeur]) => {
          if (valeur >= 0) {
            const matiere = matieresClasse.find(m => m.id === matiereId);
            if (!matiere || !selectedClasse) return;

            const bareme = getBaremeMatiere(matiere, selectedClasse.niveau);
            
            const existingNote = allNotes.find(n => 
              n.eleveId === eleveId && 
              n.matiereId === matiereId && 
              n.compositionId === selectedComposition &&
              n.classeId === selectedClasseId
            );

            const noteData = {
              eleveId,
              matiereId,
              compositionId: selectedComposition,
              classeId: selectedClasseId,
              valeur,
              bareme,
              date: new Date().toISOString()
            };

            if (existingNote) {
              db.update<Note>('notes', existingNote.id, noteData as Partial<Note>);
            } else {
              db.create('notes', noteData);
            }
          }
        });
      });
      
      // Recalculer et sauvegarder les moyennes
      elevesClasse.forEach(eleve => {
        const moyenne = calculateMoyenne(eleve.id);
        const rang = calculateRang(eleve.id);
        
        if (moyenne > 0) {
          const existingMoyenne = db.getAll<MoyenneEleve>('moyennesGenerales').find(m =>
            m.eleveId === eleve.id &&
            m.compositionId === selectedComposition &&
            m.classeId === selectedClasseId
          );

          const moyenneData = {
            eleveId: eleve.id,
            classeId: selectedClasseId,
            compositionId: selectedComposition,
            moyenne,
            rang,
            dateCalcul: new Date().toISOString()
          };

          if (existingMoyenne) {
            db.update<MoyenneEleve>('moyennesGenerales', existingMoyenne.id, moyenneData as Partial<MoyenneEleve>);
          } else {
            db.create('moyennesGenerales', moyenneData);
          }
        }
      });
      
      showToast('Notes enregistrées avec succès', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erreur lors de l\'enregistrement des notes', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getTotalMaximum = (): number => {
    if (!selectedClasse) return 0;
    return matieresClasse.reduce((total, matiere) => {
      return total + getBaremeMatiere(matiere, selectedClasse.niveau);
    }, 0);
  };

  const getDiviseurMoyenne = (): number => {
    if (!selectedClasse) return 1;
    const totalMaximum = getTotalMaximum();
    return moyenneBase === 20 ? totalMaximum / 20 : totalMaximum / 10;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* En-tête */}
      <div className="bg-white border border-gray-200 p-6 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestion des Notes par Classe</h1>
            <p className="text-gray-600 mt-2">Saisie et calcul des moyennes selon le système ivoirien</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Base de calcul</div>
            <div className="flex space-x-2 mt-2">
              <button
                onClick={() => setMoyenneBase(10)}
                className={`px-3 py-2 rounded-md font-medium transition-all ${
                  moyenneBase === 10 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                /10
              </button>
              <button
                onClick={() => setMoyenneBase(20)}
                className={`px-3 py-2 rounded-md font-medium transition-all ${
                  moyenneBase === 20 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                /20
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sélection de classe et composition */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Sélection des paramètres
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Classe</label>
            <select
              value={selectedClasseId}
              onChange={(e) => {
                setSelectedClasseId(e.target.value);
                setSelectedComposition('');
                setNotes({});
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
            >
              <option value="">Sélectionner une classe</option>
              {classes.map(classe => {
                const effectif = db.getAll<Eleve>('eleves').filter(e => 
                  e.classeId === classe.id && e.statut === 'Actif'
                ).length;
                return (
                  <option key={classe.id} value={classe.id}>
                    {classe.niveau} {classe.section} ({effectif} élèves)
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Composition</label>
            <select
              value={selectedComposition}
              onChange={(e) => {
                setSelectedComposition(e.target.value);
                setNotes({});
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
              disabled={!selectedClasseId}
            >
              <option value="">Sélectionner une composition</option>
              {compositionsNiveau.map(comp => (
                <option key={comp.id} value={comp.id}>
                  {comp.nom} (coeff. {comp.coefficient})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleSaveNotes}
              disabled={isSaving || !selectedComposition || !selectedClasseId}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>{isSaving ? 'Sauvegarde...' : 'Enregistrer'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tableau de saisie des notes */}
      {selectedClasseId && selectedComposition && matieresClasse.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Saisie des notes - {selectedClasse?.niveau} {selectedClasse?.section}
                </h3>
                <p className="text-gray-600 text-sm">
                  {compositions.find(c => c.id === selectedComposition)?.nom} • 
                  Total /{getTotalMaximum()} • 
                  Moyenne /{moyenneBase}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Notes complètes</div>
                <div className="text-2xl font-bold text-gray-900">
                  {Object.keys(notes).filter(eleveId => {
                    const notesEleve = notes[eleveId] || {};
                    return matieresClasse.every(m => notesEleve[m.id] !== undefined);
                  }).length}/{elevesClasse.length}
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-semibold text-gray-900 min-w-[60px]">
                    N°
                  </th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-sm font-semibold text-gray-900 min-w-[200px]">
                    Noms et Prénoms
                  </th>
                  {matieresClasse.map(matiere => (
                    <th key={matiere.id} className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold text-gray-900 min-w-[80px]">
                      <div>{matiere.abreviation}</div>
                      <div className="text-xs text-gray-500 font-normal">
                        /{getBaremeMatiere(matiere, selectedClasse?.niveau || '')}
                      </div>
                    </th>
                  ))}
                  <th className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold text-gray-900 min-w-[80px]">
                    <div>Total</div>
                    <div className="text-xs text-gray-500 font-normal">/{getTotalMaximum()}</div>
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold text-gray-900 min-w-[80px]">
                    <div>Moy</div>
                    <div className="text-xs text-gray-500 font-normal">/{moyenneBase}</div>
                  </th>
                  <th className="border border-gray-300 px-2 py-2 text-center text-sm font-semibold text-gray-900 min-w-[60px]">
                    Rang
                  </th>
                </tr>
              </thead>
              <tbody>
                {elevesClasse.map((eleve, index) => {
                  const total = calculateTotal(eleve.id);
                  const moyenne = calculateMoyenne(eleve.id);
                  const rang = calculateRang(eleve.id);
                  
                  return (
                    <tr key={eleve.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900">
                        {index + 1}
                      </td>
                      <td className="border border-gray-300 px-3 py-2">
                        <div className="flex items-center space-x-2">
                          {eleve.photo && (
                            <img 
                              src={eleve.photo} 
                              alt={`${eleve.prenoms} ${eleve.nom}`}
                              className="h-6 w-6 rounded-full object-cover"
                            />
                          )}
                          <div className="text-sm font-medium text-gray-900">
                            {eleve.prenoms} {eleve.nom}
                          </div>
                        </div>
                      </td>
                      {matieresClasse.map(matiere => {
                        const bareme = getBaremeMatiere(matiere, selectedClasse?.niveau || '');
                        const noteValue = notes[eleve.id]?.[matiere.id] || '';
                        
                        return (
                          <td key={matiere.id} className="border border-gray-300 px-2 py-2 text-center">
                            <input
                              type="number"
                              min="0"
                              max={bareme}
                              step="0.5"
                              value={noteValue}
                              onChange={(e) => handleNoteChange(eleve.id, matiere.id, Number(e.target.value))}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-center font-bold focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                              placeholder="0"
                            />
                          </td>
                        );
                      })}
                      <td className="border border-gray-300 px-2 py-2 text-center">
                        <div className="font-bold text-blue-600">
                          {total.toFixed(1)}
                        </div>
                      </td>
                      <td className="border border-gray-300 px-2 py-2 text-center">
                        <div className={`font-bold ${
                          moyenne >= (moyenneBase * 0.5) 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          {moyenne.toFixed(2)}
                        </div>
                      </td>
                      <td className="border border-gray-300 px-2 py-2 text-center">
                        {rang > 0 && (
                          <div className={`font-bold ${
                            rang === 1 ? 'text-yellow-600' :
                            rang <= 3 ? 'text-green-600' :
                            'text-gray-600'
                          }`}>
                            {rang}
                            {rang === 1 && <Trophy className="inline h-3 w-3 ml-1" />}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {elevesClasse.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Aucun élève dans cette classe</p>
            </div>
          )}
        </div>
      )}

      {/* Informations sur le calcul */}
      {selectedClasseId && selectedClasse && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Informations sur le calcul des moyennes
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-md p-4 border border-gray-200">
              <div className="text-center">
                <Target className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-xl font-bold text-gray-900">
                  {getTotalMaximum()}
                </div>
                <p className="text-gray-700 font-medium">Total maximum</p>
                <p className="text-xs text-gray-600 mt-1">
                  Somme des barèmes de toutes les matières
                </p>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-md p-4 border border-gray-200">
              <div className="text-center">
                <Calculator className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-xl font-bold text-gray-900">
                  {getDiviseurMoyenne().toFixed(1)}
                </div>
                <p className="text-gray-700 font-medium">Diviseur</p>
                <p className="text-xs text-gray-600 mt-1">
                  Pour obtenir la moyenne /{moyenneBase}
                </p>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-md p-4 border border-gray-200">
              <div className="text-center">
                <BookOpen className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <div className="text-xl font-bold text-gray-900">
                  {matieresClasse.length}
                </div>
                <p className="text-gray-700 font-medium">Matières</p>
                <p className="text-xs text-gray-600 mt-1">
                  Configurées pour cette classe
                </p>
              </div>
            </div>
          </div>

          {/* Détail des matières et barèmes */}
          <div className="mt-6 bg-gray-50 rounded-md p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Détail des matières</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {matieresClasse.map(matiere => {
                const bareme = getBaremeMatiere(matiere, selectedClasse.niveau);
                const diviseur = moyenneBase === 20 ? bareme / 20 : bareme / 10;
                
                return (
                  <div key={matiere.id} className="bg-white rounded-md p-3 border border-gray-200">
                    <div className="font-medium text-gray-900 text-sm">{matiere.abreviation}</div>
                    <div className="text-lg font-bold text-gray-900">/{bareme}</div>
                    <div className="text-xs text-gray-500">
                      Diviseur: {diviseur.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Statistiques de la classe */}
      {selectedClasseId && selectedComposition && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Statistiques de la classe
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="text-center p-4 bg-gray-50 rounded-md border border-gray-200">
              <div className="text-xl font-bold text-gray-900">{elevesClasse.length}</div>
              <p className="text-gray-600 font-medium">Élèves</p>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-md border border-gray-200">
              <div className="text-xl font-bold text-green-600">
                {elevesClasse.filter(e => {
                  const moyenne = calculateMoyenne(e.id);
                  return moyenne >= (moyenneBase * 0.5);
                }).length}
              </div>
              <p className="text-gray-600 font-medium">Admis</p>
              <p className="text-xs text-gray-500">≥ {moyenneBase/2}/{moyenneBase}</p>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-md border border-gray-200">
              <div className="text-xl font-bold text-red-600">
                {elevesClasse.filter(e => {
                  const moyenne = calculateMoyenne(e.id);
                  return moyenne > 0 && moyenne < (moyenneBase * 0.5);
                }).length}
              </div>
              <p className="text-gray-600 font-medium">Échec</p>
              <p className="text-xs text-gray-500">&lt; {moyenneBase/2}/{moyenneBase}</p>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-md border border-gray-200">
              <div className="text-xl font-bold text-gray-900">
                {(() => {
                  const moyennes = elevesClasse.map(e => calculateMoyenne(e.id)).filter(m => m > 0);
                  return moyennes.length > 0 ? (moyennes.reduce((a, b) => a + b, 0) / moyennes.length).toFixed(2) : '0';
                })()}
              </div>
              <p className="text-gray-600 font-medium">Moy. Classe</p>
              <p className="text-xs text-gray-500">/{moyenneBase}</p>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-md border border-gray-200">
              <div className="text-xl font-bold text-gray-900">
                {Object.keys(notes).reduce((count, eleveId) => {
                  const notesEleve = notes[eleveId] || {};
                  const notesCount = Object.values(notesEleve).filter(n => n !== undefined && n !== null).length;
                  return count + notesCount;
                }, 0)}
              </div>
              <p className="text-gray-600 font-medium">Notes saisies</p>
              <p className="text-xs text-gray-500">
                / {elevesClasse.length * matieresClasse.length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}