import { formatDate, formatCurrency } from '../../../lib/domain';
import { Avatar, Badge, Button, Modal } from '../../../components/ui';
import type { EmployeeDto, DoctorProfileDto } from '../../../api/staff.api';

interface StaffDetailModalProps {
  employee: EmployeeDto | null;
  doctorProfile?: DoctorProfileDto | null;
  open: boolean;
  onClose: () => void;
  onTransferBranch?: (employee: EmployeeDto) => void;
  onManageDoctor?: (employee: EmployeeDto) => void;
  onToggleDeactivate?: (employee: EmployeeDto) => void;
  isAdmin?: boolean;
}

export function StaffDetailModal({
  employee,
  doctorProfile,
  open,
  onClose,
  onTransferBranch,
  onManageDoctor,
  onToggleDeactivate,
  isAdmin = true,
}: StaffDetailModalProps) {
  if (!employee) return null;

  const isDoctor = employee.isDoctor || employee.positionCode.toLowerCase() === 'doctor';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee.fullName}
      description={`${employee.employeeNumber} · ${employee.positionCode}`}
      size="md"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-xl bg-clinic-900 p-4 text-white">
          <Avatar name={employee.fullName} size="lg" className="bg-white text-clinic-800 ring-0" />
          <div>
            <p className="font-bold text-base">{employee.fullName}</p>
            <p className="mt-0.5 text-xs text-clinic-100/80">
              {employee.branchName ? `${employee.branchName}` : 'Unassigned Branch'} · {employee.positionCode}
            </p>
            {employee.username && (
              <p className="mt-1 font-mono text-[11px] text-clinic-200/90">
                Username: @{employee.username} ({employee.roleCode || 'No role'})
              </p>
            )}
          </div>
          <div className="ml-auto">
            <Badge tone={employee.isActive ? 'Active' : 'Inactive'}>
              {employee.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="label-caps">NIC / Identity</dt>
            <dd className="mt-1 font-semibold text-slate-700">{employee.nic}</dd>
          </div>
          <div>
            <dt className="label-caps">Gender / DOB</dt>
            <dd className="mt-1 font-semibold text-slate-700">
              {employee.genderCode} · {employee.dateOfBirth}
            </dd>
          </div>
          <div>
            <dt className="label-caps">Hire Date</dt>
            <dd className="mt-1 font-semibold text-slate-700">{formatDate(employee.hireDate)}</dd>
          </div>
          <div>
            <dt className="label-caps">Employment Status</dt>
            <dd className="mt-1 font-semibold text-slate-700">{employee.employmentStatus}</dd>
          </div>
          <div className="col-span-2">
            <dt className="label-caps">Contact</dt>
            <dd className="mt-1 font-semibold text-slate-700">
              {employee.phone} {employee.email ? `· ${employee.email}` : ''}
            </dd>
          </div>

          {doctorProfile && (
            <>
              <div>
                <dt className="label-caps">Medical Licence</dt>
                <dd className="mt-1 font-semibold text-slate-700">{doctorProfile.medicalLicenseNo}</dd>
              </div>
              <div>
                <dt className="label-caps">Consultation Fee</dt>
                <dd className="mt-1 font-semibold text-slate-700">
                  {doctorProfile.defaultConsultationFee
                    ? formatCurrency(doctorProfile.defaultConsultationFee)
                    : 'Not configured'}
                </dd>
              </div>
              {doctorProfile.specialties.length > 0 && (
                <div className="col-span-2">
                  <dt className="label-caps">Specialties</dt>
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {doctorProfile.specialties.map((s) => (
                      <Badge key={s.specialtyId} tone="Active">
                        {s.name} {s.isPrimary ? '★' : ''}
                      </Badge>
                    ))}
                  </dd>
                </div>
              )}
            </>
          )}
        </dl>

        {isAdmin && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            {isDoctor && onManageDoctor && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onManageDoctor(employee);
                }}
              >
                Doctor credentials
              </Button>
            )}
            {onTransferBranch && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onTransferBranch(employee);
                }}
              >
                Transfer branch
              </Button>
            )}
            {onToggleDeactivate && (
              <Button
                variant={employee.isActive ? 'danger' : 'secondary'}
                size="sm"
                onClick={() => {
                  onClose();
                  onToggleDeactivate(employee);
                }}
              >
                {employee.isActive ? 'Deactivate employee' : 'Reactivate employee'}
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
