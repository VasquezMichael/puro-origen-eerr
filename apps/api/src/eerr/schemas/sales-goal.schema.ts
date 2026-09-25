import { Schema, type Types } from 'mongoose';
import { normalizeSalesGoal, type SalesGoalValue } from '@puro-origen/domain';

export type StoredSalesGoal = {
  mode: SalesGoalValue['mode'];
  value: Types.Decimal128;
  updatedAt: Date;
  // Los IDs de usuario vigentes son ObjectId; se conserva su texto autenticado.
  updatedBy: string;
};

export const SalesGoalSchema = new Schema<StoredSalesGoal>(
  {
    mode: {
      type: String,
      enum: ['NET_MARGIN_PERCENT', 'NET_PROFIT_AMOUNT'],
      required: true,
    },
    value: { type: Schema.Types.Decimal128, required: true },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, required: true },
  },
  { _id: false, strict: 'throw' },
);

export function publicSalesGoal(goal: StoredSalesGoal | null | undefined) {
  if (goal == null) return null;
  const value = goal.value.toString();
  // También valida documentos históricos alterados o incoherentes.
  if (normalizeSalesGoal({ mode: goal.mode, value }).value !== value)
    throw new Error('Meta persistida no canónica');
  return {
    mode: goal.mode,
    value,
    updatedAt: goal.updatedAt.toISOString(),
    updatedBy: goal.updatedBy,
  };
}
