import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TreatmentPhotoUploadProps {
  onPhotoSelect: (file: File) => void;
  currentPhotoUrl?: string | null;
  onRemovePhoto?: () => void;
  disabled?: boolean;
}

export function TreatmentPhotoUpload({
  onPhotoSelect,
  currentPhotoUrl,
  onRemovePhoto,
  disabled = false
}: TreatmentPhotoUploadProps) {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl || null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreviewUrl(currentPhotoUrl || null);
  }, [currentPhotoUrl]);

  useEffect(() => {
    const stopWebcamStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };

    if (isWebcamActive) {
      const startWebcamStream = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "environment" // Prefer back camera on mobile
            }
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            streamRef.current = stream;
          }
        } catch (error) {
          toast({
            title: "Erro ao acessar câmera",
            description: "Não foi possível acessar a câmera do dispositivo. Verifique as permissões.",
            variant: "destructive",
          });
          setIsWebcamActive(false);
        }
      };
      startWebcamStream();
    }

    return () => {
      stopWebcamStream();
    };
  }, [isWebcamActive, toast]);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  };

  const validateAndProcessFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O tamanho máximo permitido é 5MB",
        variant: "destructive",
      });
      return;
    }

    onPhotoSelect(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setIsModalOpen(false);
  };

  const startWebcam = () => {
    setIsWebcamActive(true);
  };

  const stopWebcam = () => {
    setIsWebcamActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
            onPhotoSelect(file);
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
            stopWebcam();
            setIsModalOpen(false);
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    if (onRemovePhoto) {
      onRemovePhoto();
    }
    setIsModalOpen(false);
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={handleFileSelect}
            disabled={disabled}
            className="flex items-center gap-2"
            data-testid="button-upload-treatment-photo"
          >
            <Upload className="h-4 w-4" />
            <span>Carregar Arquivo</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleCameraCapture}
            disabled={disabled}
            className="flex items-center gap-2"
            data-testid="button-camera-treatment-photo"
          >
            <Camera className="h-4 w-4" />
            <span>Tirar Foto</span>
          </Button>

          {/* File input for upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            data-testid="input-file-upload"
          />

          {/* Camera input with capture attribute for mobile */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
            data-testid="input-camera-capture"
          />
        </div>

        {/* Preview of selected/current photo */}
        {previewUrl && (
          <div className="relative inline-block mt-2">
            <img
              src={previewUrl}
              alt="Preview"
              className="w-32 h-32 object-cover rounded-lg border border-gray-200"
              data-testid="img-treatment-photo-preview"
            />
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleRemove}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                data-testid="button-remove-treatment-photo"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Webcam Modal (for desktop/devices that support it) */}
      <Dialog open={isModalOpen && isWebcamActive} onOpenChange={(open) => {
        setIsModalOpen(open);
        if (!open) stopWebcam();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Capturar Foto</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full"
              />
            </div>
            <div className="flex justify-center gap-3">
              <Button onClick={stopWebcam} variant="outline">
                Cancelar
              </Button>
              <Button onClick={capturePhoto} data-testid="button-capture-webcam">
                <Camera className="w-4 h-4 mr-2" />
                Capturar Foto
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
