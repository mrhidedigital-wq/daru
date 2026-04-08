// src/components/daru/CharacterCreator.jsx
import React, { useState } from 'react';
import SketchProcessor from './SketchProcessor';
import TextToCharacter from './TextToCharacter';
import ActionGenerator from './ActionGenerator';
import AnimationPipeline from './AnimationPipeline';

const CharacterCreator = ({ onProjectComplete, initialMode = 'sketch' }) => {
  const [mode, setMode] = useState(initialMode);
  const [character, setCharacter] = useState(null);
  const [actions, setActions] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">DARU - Creación de Personajes</h1>
      
      {/* Selector de Modalidad */}
      <div className="mb-8">
        <div className="flex space-x-4">
          <button
            onClick={() => setMode('sketch')}
            className={`px-6 py-3 rounded-lg font-medium ${
              mode === 'sketch' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            📝 Subir Boceto
          </button>
          <button
            onClick={() => setMode('text')}
            className={`px-6 py-3 rounded-lg font-medium ${
              mode === 'text' 
                ? 'bg-purple-600 text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            ✍️ Describir Personaje
          </button>
        </div>
      </div>

      {/* Pipeline de Pasos */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {step}
              </div>
              {step < 4 && <div className="w-16 h-1 bg-gray-300 mx-2"></div>}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-sm text-gray-600">
          <span>Crear/Subir</span>
          <span>Procesar</span>
          <span>Acciones</span>
          <span>Animación</span>
        </div>
      </div>

      {/* Contenido según modalidad y paso */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        {currentStep === 1 && (
          <div>
            {mode === 'sketch' ? (
              <SketchProcessor 
                onCharacterCreated={setCharacter}
                onNext={() => setCurrentStep(2)}
              />
            ) : (
              <TextToCharacter 
                onCharacterCreated={setCharacter}
                onNext={() => setCurrentStep(2)}
              />
            )}
          </div>
        )}

        {currentStep === 2 && character && (
          <ActionGenerator
            character={character}
            mode={mode}
            onActionsGenerated={setActions}
            onNext={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 3 && actions.length > 0 && (
          <AnimationPipeline
            character={character}
            actions={actions}
            onAnimationComplete={(result) => {
              setCurrentStep(4);
              if (onProjectComplete) {
                onProjectComplete({
                  character,
                  actions,
                  animation: result,
                  mode,
                  completedAt: new Date().toISOString()
                });
              }
            }}
          />
        )}
        
        {currentStep === 4 && (
          <div className="text-center py-8">
            <h2 className="text-2xl font-bold text-green-600 mb-4">
              🎉 ¡Proyecto Completado!
            </h2>
            <p className="text-gray-600 mb-6">
              Tu personaje animado ha sido creado exitosamente
            </p>
            <button
              onClick={() => {
                setCurrentStep(1);
                setCharacter(null);
                setActions([]);
              }}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Crear Nuevo Proyecto
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CharacterCreator;