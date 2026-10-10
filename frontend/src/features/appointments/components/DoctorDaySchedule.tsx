/**
 * src/features/appointments/components/DoctorDaySchedule.tsx
 * Owner: Dev1 | Issue: CATMS-061
 *
 * Desktop schedule grid displaying doctor columns and time slots with
 * real-time booking preview triggers and appointment status badges.
 */

import { Clock3, Zap } from 'lucide-react';
import { Avatar } from '../../../components/ui';
import { TIME_SLOTS_30MIN } from '../utils';
import type { Appointment, StaffMember } from '../../../types';

export interface DoctorDayScheduleProps {
  doctors: StaffMember[];
  appointments: Appointment[];
  patientNameMap: Record<string, string>;
  canManage: boolean;
  onSelectAppointment: (appointment: Appointment) => void;
  onSelectSlot: (doctorId: string, time: string) => void;
}

export function DoctorDaySchedule({
  doctors,
  appointments,
  patientNameMap,
  canManage,
  onSelectAppointment,
  onSelectSlot,
}: DoctorDayScheduleProps) {
  return (
    <section className="table-shell hidden overflow-x-auto md:block" aria-label="Doctor day schedule">
      <div
        className="grid min-w-[760px]"
        style={{
          gridTemplateColumns: `5.5rem repeat(${Math.max(doctors.length, 1)}, minmax(15rem, 1fr))`,
        }}
      >
        {/* Header corner */}
        <div className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 p-4">
          <Clock3 size={16} className="text-slate-400" />
        </div>

        {/* Doctor column headers */}
        {doctors.map((doctor) => (
          <div
            key={doctor.id}
            className="border-b border-r border-slate-200 bg-slate-50 p-3 last:border-r-0"
          >
            <div className="flex items-center gap-2">
              <Avatar name={doctor.name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-800">{doctor.name}</p>
                <p className="truncate text-[10px] text-slate-400">
                  {doctor.specialties?.[0] || 'General Doctor'}
                </p>
              </div>
            </div>
          </div>
        ))}

        {doctors.length === 0 && (
          <div className="border-b border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
            No doctors assigned to this branch
          </div>
        )}

        {/* Time slot rows */}
        {TIME_SLOTS_30MIN.map((time) => (
          <div key={time} className="contents">
            <div className="sticky left-0 z-10 h-[4.25rem] border-r border-t border-slate-100 bg-white px-3 py-2 text-[11px] font-semibold text-slate-400">
              {time}
            </div>

            {doctors.map((doctor) => {
              const item = appointments.find(
                (apt) => apt.doctorId === doctor.id && apt.start === time,
              );

              return (
                <div
                  key={doctor.id}
                  className="relative h-[4.25rem] border-r border-t border-slate-100 p-1.5 last:border-r-0"
                >
                  {item ? (
                    <button
                      type="button"
                      onClick={() => onSelectAppointment(item)}
                      className={`h-full w-full rounded-lg border-l-4 px-3 py-2 text-left transition hover:brightness-[.98] ${
                        item.status === 'Completed'
                          ? 'border-[#1E8A5F] bg-[#E7F5EE]'
                          : item.status === 'Cancelled'
                          ? 'border-[#8A97A0] bg-[#EFF3F3] opacity-75'
                          : 'border-[#1E77B8] bg-[#EAF4FB]'
                      }`}
                    >
                      <span className="block truncate text-xs font-bold text-slate-800">
                        {patientNameMap[item.patientId] || 'Patient'}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500">
                        {item.start}–{item.end}
                        {item.source === 'Walk-in' && (
                          <>
                            {' '}· <Zap size={9} /> Walk-in
                          </>
                        )}
                      </span>
                    </button>
                  ) : canManage ? (
                    <button
                      type="button"
                      onClick={() => onSelectSlot(doctor.id, time)}
                      className="group h-full w-full rounded-lg p-1.5"
                      aria-label={`Preview and book ${doctor.name} at ${time}`}
                    >
                      <span className="slot-ghost flex h-full w-full items-center justify-center gap-1.5 rounded-md px-2 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                        <span className="live-pulse" />
                        Free · preview
                      </span>
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
