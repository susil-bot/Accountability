'use client';
import { Controller, type Control, type FieldErrors, type FieldValues, type UseFormRegister, type UseFormWatch } from 'react-hook-form';
import { Input, Select } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { ToggleChip, toggleIn } from '@/components/ui/toggle-chip';
import { DAY_OPTIONS, UNIT_OPTIONS, type CommitmentForm } from './commitment-schema';

/** The editor is mounted under different form roots (wizard array item or standalone), so form handles are loosely typed. */
type Props = {
  prefix: string;
  idPrefix: string;
  control: unknown;
  register: unknown;
  watch: unknown;
  errors?: FieldErrors<CommitmentForm>;
};

/** Field group for one commitment. `prefix` is the RHF path, e.g. "commitments.0" or "" for a standalone form. */
export function CommitmentEditor({ prefix, idPrefix, errors, ...handles }: Props) {
  const control = handles.control as Control<FieldValues>;
  const register = handles.register as UseFormRegister<FieldValues>;
  const watch = handles.watch as UseFormWatch<FieldValues>;
  const p = (k: keyof CommitmentForm) => (prefix ? `${prefix}.${k}` : k);
  const scheduleType = watch(p('scheduleType')) as CommitmentForm['scheduleType'];
  const unit = watch(p('targetUnit')) as CommitmentForm['targetUnit'];

  return (
    <div className="grid gap-4">
      <Field id={`${idPrefix}-title`} label="Action" error={errors?.title?.message}>
        <Input id={`${idPrefix}-title`} placeholder="e.g. Apply to 5 jobs" aria-invalid={!!errors?.title} {...register(p('title'))} />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">How often?</legend>
        <Controller
          control={control}
          name={p('scheduleType')}
          render={({ field }) => (
            <Segmented<CommitmentForm['scheduleType']>
              label="Frequency"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'DAILY', label: 'Every day' },
                { value: 'WEEKLY_DAYS', label: 'Some days' },
                { value: 'TIMES_PER_WEEK', label: 'N× / week' },
              ]}
            />
          )}
        />
        {scheduleType === 'WEEKLY_DAYS' && (
          <Controller
            control={control}
            name={p('days')}
            render={({ field }) => (
              <div className="mt-1" role="group" aria-label="Days of the week">
                <div className="grid grid-cols-7 gap-1.5">
                  {DAY_OPTIONS.map((d) => (
                    <ToggleChip
                      key={d.key}
                      emphasis="solid"
                      className="px-0 text-xs"
                      pressed={(field.value as string[]).includes(d.key)}
                      onPressedChange={(on) => field.onChange(toggleIn(field.value as string[], d.key, on))}
                    >
                      {d.short}
                    </ToggleChip>
                  ))}
                </div>
                {errors?.days?.message && (
                  <p role="alert" className="mt-1 text-xs font-medium text-danger">
                    {errors.days.message}
                  </p>
                )}
              </div>
            )}
          />
        )}
        {scheduleType === 'TIMES_PER_WEEK' && (
          <div className="mt-1 flex items-center gap-3">
            <Label htmlFor={`${idPrefix}-tpw`} className="text-sm text-muted-foreground">
              Times per week
            </Label>
            <Input id={`${idPrefix}-tpw`} type="number" inputMode="numeric" min={1} max={7} className="w-24" {...register(p('timesPerWeek'), { valueAsNumber: true })} />
          </div>
        )}
      </fieldset>

      {scheduleType !== 'TIMES_PER_WEEK' && (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field id={`${idPrefix}-unit`} label="Measured as">
            <Select id={`${idPrefix}-unit`} {...register(p('targetUnit'))}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
          {unit !== 'BOOLEAN' && (
            <Field id={`${idPrefix}-target`} label="Target" error={errors?.targetValue?.message}>
              <Input id={`${idPrefix}-target`} type="number" inputMode="decimal" step="any" min={0} className="w-24" aria-invalid={!!errors?.targetValue} {...register(p('targetValue'), { valueAsNumber: true })} />
            </Field>
          )}
        </div>
      )}
      {unit === 'CUSTOM' && scheduleType !== 'TIMES_PER_WEEK' && (
        <Field id={`${idPrefix}-custom`} label="Unit name" error={errors?.customUnitLabel?.message}>
          <Input id={`${idPrefix}-custom`} placeholder="e.g. pages" {...register(p('customUnitLabel'))} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field id={`${idPrefix}-time`} label="Preferred time" hint="Optional">
          <Input id={`${idPrefix}-time`} type="time" {...register(p('preferredTime'))} />
        </Field>
        <div className="grid content-start gap-2">
          <span className="text-sm font-medium">Evidence</span>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register(p('evidenceRequired'))} />
            Ask for proof
          </label>
        </div>
      </div>
    </div>
  );
}
