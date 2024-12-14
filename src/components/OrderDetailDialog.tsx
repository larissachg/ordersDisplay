import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dispatch, SetStateAction } from "react";

interface OrderDetailDialogProps {
  orden: number;
  detalle: string;
  open: boolean;
  onClose: Dispatch<SetStateAction<boolean>>;
}

export const OrderDetailDialog = ({
  orden,
  detalle,
  onClose,
  open,
}: OrderDetailDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Detalles de la Orden #{orden}</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <div className="whitespace-pre-wrap break-words">{detalle}</div>
      </DialogContent>
    </Dialog>
  );
};
