import { useState, useRef } from "react";
import { Cropper, ReactCropperElement } from "react-cropper";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Trash2, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PhotoUploadProps {
  currentPhotoUrl?: string | null;
  patientId?: string;
  patientName?: string;
  onPhotoChange?: (photoUrl: string) => void;
  disabled?: boolean;
}

export function PhotoUpload({ 
  currentPhotoUrl, 
  patientId,
  patientName = "Paciente",
  onPhotoChange,
  disabled = false 
}: PhotoUploadProps) {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const cropperRef = useRef<ReactCropperElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Iniciar webcam
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsWebcamActive(true);
      }
    } catch (error) {
      toast({
        title: "Erro ao acessar câmera",
        description: "Não foi possível acessar a câmera do dispositivo",
        variant: "destructive",
      });
    }
  };

  // Parar webcam
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsWebcamActive(false);
  };

  // Capturar foto da webcam
  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg');
        setImageToCrop(imageData);
        setIsCropModalOpen(true);
        stopWebcam();
        setIsModalOpen(false);
      }
    }
  };

  // Abrir seletor de arquivo
  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Processar arquivo selecionado
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Arquivo inválido",
          description: "Por favor, selecione uma imagem",
          variant: "destructive",
        });
        return;
      }

      // Validar tamanho (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Arquivo muito grande",
          description: "O tamanho máximo permitido é 5MB",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result as string);
        setIsCropModalOpen(true);
        setIsModalOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Converter canvas.toBlob em Promise para melhor erro handling
  const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Não foi possível processar a imagem recortada'));
          }
        },
        type,
        quality
      );
    });
  };

  // Processar imagem recortada e fazer upload
  const handleCropComplete = async () => {
    if (!cropperRef.current?.cropper || !patientId) return;

    setIsUploading(true);
    
    try {
      // Obter imagem recortada como canvas
      const canvas = cropperRef.current.cropper.getCroppedCanvas({
        width: 800,
        height: 600,
        imageSmoothingQuality: 'high',
      });

      // Converter canvas para blob
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);

      // Criar FormData e fazer upload
      const formData = new FormData();
      formData.append('photo', blob, 'photo.jpg');

      const token = localStorage.getItem('dental_token');
      const response = await fetch(`/api/patients/${patientId}/photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Erro ao fazer upload' }));
        throw new Error(errorData.message || 'Erro ao fazer upload da foto');
      }

      const result = await response.json();
      
      toast({
        title: "Foto atualizada",
        description: "A foto do paciente foi atualizada com sucesso",
      });

      if (onPhotoChange && result.photoUrl) {
        onPhotoChange(result.photoUrl);
      }

      setIsCropModalOpen(false);
      setImageToCrop(null);
    } catch (error: any) {
      toast({
        title: "Erro ao fazer upload",
        description: error.message || "Não foi possível fazer upload da foto",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Remover foto
  const handleRemovePhoto = async () => {
    if (!patientId) return;

    try {
      setIsUploading(true);
      const token = localStorage.getItem('dental_token');
      
      const response = await fetch(`/api/patients/${patientId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ photoUrl: null }),
      });

      if (!response.ok) {
        throw new Error('Erro ao remover foto');
      }

      toast({
        title: "Foto removida",
        description: "A foto do paciente foi removida com sucesso",
      });

      if (onPhotoChange) {
        onPhotoChange('');
      }

      setIsModalOpen(false);
    } catch (error: any) {
      toast({
        title: "Erro ao remover foto",
        description: error.message || "Não foi possível remover a foto",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div className="flex items-center space-x-4">
        {/* Preview da foto atual */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={disabled || !patientId}
          className="relative group"
          data-testid="button-open-photo-options"
        >
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-100 flex items-center justify-center hover:border-blue-500 transition-colors">
            {currentPhotoUrl ? (
              <img
                src={currentPhotoUrl}
                alt={patientName}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-12 h-12 text-gray-400" />
            )}
          </div>
          <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity flex items-center justify-center">
            <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>

        <div>
          <p className="text-sm font-medium text-gray-700">Foto do Paciente</p>
          <p className="text-xs text-gray-500">
            {currentPhotoUrl ? "Clique para alterar" : "Clique para adicionar"}
          </p>
        </div>
      </div>

      {/* Modal de opções */}
      <Dialog open={isModalOpen} onOpenChange={(open) => {
        setIsModalOpen(open);
        if (!open) stopWebcam();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Foto do Paciente</DialogTitle>
          </DialogHeader>

          {isWebcamActive ? (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full"
                />
              </div>
              <div className="flex justify-center space-x-3">
                <Button onClick={stopWebcam} variant="outline">
                  Cancelar
                </Button>
                <Button onClick={capturePhoto} data-testid="button-capture-photo">
                  <Camera className="w-4 h-4 mr-2" />
                  Capturar Foto
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                data-testid="input-photo-file"
              />
              
              <Button
                onClick={handleFileSelect}
                className="w-full"
                variant="outline"
                data-testid="button-upload-photo"
              >
                <Upload className="w-4 h-4 mr-2" />
                Carregar Arquivo
              </Button>

              <Button
                onClick={startWebcam}
                className="w-full"
                variant="outline"
                data-testid="button-open-camera"
              >
                <Camera className="w-4 h-4 mr-2" />
                Tirar Foto (Câmera)
              </Button>

              {currentPhotoUrl && (
                <Button
                  onClick={handleRemovePhoto}
                  className="w-full"
                  variant="destructive"
                  disabled={isUploading}
                  data-testid="button-remove-photo"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {isUploading ? "Removendo..." : "Remover Foto"}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de recorte */}
      <Dialog open={isCropModalOpen} onOpenChange={setIsCropModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Recortar Foto</DialogTitle>
          </DialogHeader>

          {imageToCrop && (
            <div className="max-h-96 overflow-hidden">
              <Cropper
                ref={cropperRef}
                src={imageToCrop}
                style={{ height: 400, width: '100%' }}
                aspectRatio={4 / 3}
                guides={true}
                viewMode={1}
                dragMode="move"
                cropBoxResizable={true}
                cropBoxMovable={true}
                background={false}
                responsive={true}
                autoCropArea={1}
                checkOrientation={false}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setIsCropModalOpen(false);
                setImageToCrop(null);
              }}
              variant="outline"
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCropComplete}
              disabled={isUploading}
              data-testid="button-confirm-crop"
            >
              {isUploading ? "Salvando..." : "Salvar Foto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
