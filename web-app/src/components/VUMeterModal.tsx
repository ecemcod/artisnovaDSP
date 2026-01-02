import { useEffect, useCallback } from 'react';
import AnalogVUMeter from './AnalogVUMeter';
import { } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    leftLevel: number;
    rightLevel: number;
}

const VUMeterModal: React.FC<Props> = ({ isOpen, onClose, leftLevel, rightLevel }) => {
    // Handle ESC key
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    }, [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={onClose}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                style={{ animation: 'fadeIn 0.2s ease-out' }}
            />

            {/* Modal Content */}
            <div
                className="relative z-10 p-8 rounded-2xl"
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'linear-gradient(145deg, #3a2518 0%, #251510 50%, #1a0d08 100%)',
                    boxShadow: '0 25px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1)',
                    border: '4px solid #8B7355',
                    animation: 'scaleIn 0.2s ease-out'
                }}
            >

                {/* Title */}
                <div className="text-center mb-6">
                    <h2
                        className="text-3xl font-bold tracking-widest"
                        style={{
                            color: '#D4C8A8',
                            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                            fontFamily: 'serif'
                        }}
                    >
                        STEREO VU METER
                    </h2>
                    <div
                        className="text-sm tracking-wider mt-1"
                        style={{ color: '#8B7355' }}
                    >
                        PROFESSIONAL AUDIO
                    </div>
                </div>

                {/* Meters */}
                <div className="flex gap-8">
                    <AnalogVUMeter level={leftLevel} channel="L" />
                    <AnalogVUMeter level={rightLevel} channel="R" />
                </div>

                {/* Brand plate */}
                <div
                    className="mt-6 text-center py-2 px-4 mx-auto rounded"
                    style={{
                        background: 'linear-gradient(180deg, #C9A227 0%, #8B7355 50%, #6B5344 100%)',
                        width: 'fit-content',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.5)'
                    }}
                >
                    <span
                        className="text-sm font-bold tracking-[0.3em]"
                        style={{ color: '#1a0d08', textShadow: '0 1px 0 rgba(255,255,255,0.2)' }}
                    >
                        ARTIS NOVA DSP
                    </span>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default VUMeterModal;
