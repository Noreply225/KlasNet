import React, { useState, useEffect } from 'react';
import { useToast } from '../Layout/ToastProvider';
import { Save, X } from 'lucide-react';
import { db } from '../../utils/database';
import { Matiere } from '../../types';

interface MatiereFormProps {
  matiere?: Matiere | null;
  onSave: (matiere: Matiere) => void;
  onCancel: () => void;
}

export default function MatiereForm({ matiere, onSave, onCancel }: MatiereFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    nom: '',
    abreviation: '',
    coefficient: 1,
    type: 'Fondamentale' as 'Fondamentale' | 'Éveil' | 'Expression',
    obligatoire: true,
    classeIds: [] as string[],
    baremeParNiveau: {} as Record<string, { min: number; max: number }>
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [selectedNiveau, setSelectedNiveau] = useState('CP1');

  const niveaux = [
    'Petite Section', 'Moyenne Section', 'Grande Section',
    'CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'
  ];

  useEffect(() => {
    if (matiere) {
      setFormData({
        nom: matiere.nom,
        abreviation: matiere.abreviation,
        coefficient: matiere.coefficient,
        type: matiere.type,
        obligatoire: matiere.obligatoire,
        classeIds: matiere.classeIds || [],
        baremeParNiveau: matiere.baremeParNiveau || {}
      });
    }
  }, [matiere]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.nom.trim()) newErrors.nom = 'Le nom de la matière est obligatoire';
    if (!formData.abreviation.trim()) newErrors.abreviation = 'L\'abréviation est obligatoire';
    if (formData.coefficient < 1 || formData.coefficient > 10) newErrors.coefficient = 'Le coefficient doit être entre 1 et 10';

    const matieres = db.getAll<Matiere>('matieres');
    const existingMatiere = matieres.find(m => 
      m.nom.toLowerCase() === formData.nom.toLowerCase() && 
      m.id !== matiere?.id
    );
    if (existingMatiere) {
      newErrors.nom = 'Une matière avec ce nom existe déjà';
    }

    const existingAbreviation = matieres.find(m => 
      m.abreviation.toLowerCase() === formData.abreviation.toLowerCase() && 
      m.id !== matiere?.id
    );
    if (existingAbreviation) {
      newErrors.abreviation = 'Une matière avec cette abréviation existe déjà';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSaving(true);
    try {
      if (matiere) {
        const updatedMatiere = db.update<Matiere>('matieres', matiere.id, formData);
        if (updatedMatiere) {
          showToast('Matière mise à jour avec succès', 'success');
          onSave(updatedMatiere);
        }
      } else {
        const newMatiere = db.create<Matiere>('matieres', formData);
        showToast('Matière ajoutée avec succès', 'success');
        onSave(newMatiere);
      }
    } catch {
      showToast('Erreur lors de la sauvegarde de la matière', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        {/* En-tête moderne */}
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {matiere ? 'Modifier la matière' : 'Nouvelle matière'}
              </h1>
              <p className="text-gray-600 mt-1">
                {matiere ? 'Modifiez les informations de la matière' : 'Créez une nouvelle matière'}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Informations de base */}
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Informations de base
            </h3>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Nom de la matière <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => handleInputChange('nom', e.target.value)}
                className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-gray-500 transition-colors ${
                  errors.nom ? 'border-red-300 bg-red-50 focus:border-red-500' : 'border-gray-300 focus:border-gray-500'
                }`}
                placeholder="Ex: Mathématiques, Français, Sciences..."
              />
              {errors.nom && <p className="mt-2 text-sm text-red-600 flex items-center"><span className="mr-1">⚠️</span>{errors.nom}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Abréviation <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.abreviation}
                onChange={(e) => handleInputChange('abreviation', e.target.value.toUpperCase())}
                className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-gray-500 transition-colors ${
                  errors.abreviation ? 'border-red-300 bg-red-50 focus:border-red-500' : 'border-gray-300 focus:border-gray-500'
                }`}
                placeholder="Ex: MATH, FR, AEM..."
                maxLength={10}
              />
              {errors.abreviation && <p className="mt-2 text-sm text-red-600 flex items-center"><span className="mr-1">⚠️</span>{errors.abreviation}</p>}
              <p className="mt-2 text-xs text-gray-500">
                Abréviation utilisée dans les tableaux de notes (max 10 caractères)
              </p>
            </div>
          </div>

          {/* Configuration avancée */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Configuration avancée
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Type de matière <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {[
                    { value: 'Fondamentale', label: 'Fondamentale', desc: 'Matières principales (Français, Maths...)' },
                    { value: 'Éveil', label: 'Éveil', desc: 'Matières d\'éveil (Sciences, Histoire...)' },
                    { value: 'Expression', label: 'Expression', desc: 'Matières d\'expression (Arts, Sport...)' }
                  ].map(type => (
                    <label key={type.value} className={`flex items-center p-4 border rounded-md cursor-pointer transition-all ${
                      formData.type === type.value 
                        ? 'border-gray-900 bg-gray-50' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="type"
                        value={type.value}
                        checked={formData.type === type.value}
                        onChange={(e) => handleInputChange('type', e.target.value)}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{type.label}</div>
                        <div className="text-sm text-gray-600 mt-1">{type.desc}</div>
                      </div>
                      {formData.type === type.value && (
                        <div className="w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center ml-3">
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Coefficient <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.coefficient}
                      onChange={(e) => handleInputChange('coefficient', parseInt(e.target.value))}
                      className={`w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-gray-500 transition-colors ${
                        errors.coefficient ? 'border-red-300 bg-red-50 focus:border-red-500' : 'border-gray-300 focus:border-gray-500'
                      }`}
                      min="1"
                      max="100"
                    />
                    {errors.coefficient && <p className="mt-2 text-sm text-red-600 flex items-center"><span className="mr-1">⚠️</span>{errors.coefficient}</p>}
                    <p className="mt-2 text-xs text-gray-500">
                      Poids de la matière dans le calcul de la moyenne (1-100)
                    </p>
                  </div>
                </div>

                <div>
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.obligatoire}
                      onChange={(e) => handleInputChange('obligatoire', e.target.checked)}
                      className="w-4 h-4 text-gray-900 border border-gray-300 rounded focus:ring-gray-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Matière obligatoire
                    </span>
                  </label>
                  <p className="mt-2 text-xs text-gray-500 ml-8">
                    Les matières obligatoires doivent être enseignées dans toutes les classes du niveau correspondant
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration des barèmes par niveau */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Configuration des barèmes par niveau
            </h3>
            
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2 mb-4">
                {niveaux.map(niveau => (
                  <button
                    key={niveau}
                    type="button"
                    onClick={() => setSelectedNiveau(niveau)}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      selectedNiveau === niveau
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {niveau}
                  </button>
                ))}
              </div>

              <div className="bg-gray-50 rounded-md p-4">
                <h4 className="font-semibold text-gray-900 mb-4">
                  Barème pour {selectedNiveau}
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Note minimale
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.baremeParNiveau[selectedNiveau]?.min || 0}
                      onChange={(e) => {
                        const newBareme = {
                          ...formData.baremeParNiveau,
                          [selectedNiveau]: {
                            ...formData.baremeParNiveau[selectedNiveau],
                            min: Number(e.target.value)
                          }
                        };
                        handleInputChange('baremeParNiveau', newBareme);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Note maximale
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.baremeParNiveau[selectedNiveau]?.max || 20}
                      onChange={(e) => {
                        const newBareme = {
                          ...formData.baremeParNiveau,
                          [selectedNiveau]: {
                            ...formData.baremeParNiveau[selectedNiveau],
                            max: Number(e.target.value)
                          }
                        };
                        handleInputChange('baremeParNiveau', newBareme);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="mt-4 p-3 bg-gray-100 rounded-md">
                  <p className="text-sm text-gray-700">
                    <strong>Exemple pour {selectedNiveau}:</strong> 
                    {selectedNiveau === 'CE2' ? ' Mathématiques /50, Orthographe /20' : ' Notes généralement /20'}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Les notes seront automatiquement converties pour le calcul des moyennes
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Aperçu des barèmes configurés */}
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-4">
              Aperçu des barèmes configurés
            </h4>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {niveaux.map(niveau => {
                const bareme = formData.baremeParNiveau[niveau];
                return (
                  <div key={niveau} className="bg-white rounded-md p-3 border border-gray-200">
                    <div className="font-medium text-gray-900 text-sm">{niveau}</div>
                    <div className="text-lg font-bold text-gray-900">
                      /{bareme?.max || 20}
                    </div>
                    <div className="text-xs text-gray-500">
                      Min: {bareme?.min || 0}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exemples de coefficients */}

          {/* Actions */}
          <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex items-center space-x-2 px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 focus:ring-2 focus:ring-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSaving}
            >
              {isSaving ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <Save className="h-5 w-5" />
              )}
              <span className="font-medium">
                {matiere ? (isSaving ? 'Sauvegarde...' : 'Mettre à jour la matière') : (isSaving ? 'Sauvegarde...' : 'Créer la matière')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}