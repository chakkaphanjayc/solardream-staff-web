"use client";

import { useState } from "react";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  HardHat,
  Layers,
  MapPin,
  Plus,
  Search,
  UserCheck,
  Users,
  Wrench,
  X,
} from "@/components/ui/icons";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import { assignDeliveryTaskAction } from "@/app/actions/deliveryTasks";
import type { DeliveryProject, DeliveryTask, DeliveryAssignee } from "@/types/delivery";
import { AdminBulkActionBar } from "@/components/admin/AdminBulkActionBar";
import { AdminSelectionCheckbox } from "@/components/admin/AdminSelectionCheckbox";
import { useAdminSelection } from "@/hooks/useAdminSelection";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";

interface DeliveryDispatchBoardClientProps {
  locale: string;
  initialProjects: DeliveryProject[];
  initialTasks: DeliveryTask[];
  technicians: DeliveryAssignee[];
}

function getStatusTone(status: DeliveryTask["status"]) {
  if (status === "COMPLETED") return "success";
  if (status === "IN_PROGRESS" || status === "HANDOVER_PENDING") return "info";
  if (status === "SCHEDULED") return "warning";
  return "neutral";
}

export default function DeliveryDispatchBoardClient({
  locale,
  initialProjects,
  initialTasks,
  technicians,
}: DeliveryDispatchBoardClientProps) {
  const [tasks, setTasks] = useState<DeliveryTask[]>(initialTasks);
  const [projects, setProjects] = useState<DeliveryProject[]>(initialProjects);
  const [viewMode, setViewMode] = useState<"gantt" | "calendar" | "list">("gantt");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<DeliveryTask | null>(null);

  // Modal State for Task Assignment
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningTask, setAssigningTask] = useState<DeliveryTask | null>(null);
  const [selectedTechId, setSelectedTechId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignedEventLink, setAssignedEventLink] = useState<string | null>(null);

  const filteredTasks = tasks.filter(
    (t) =>
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.projectCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const unassignedTasks = filteredTasks.filter((t) => t.status === "OPEN" || !t.assignedUserId);
  const scheduledTasks = filteredTasks.filter((t) => t.status !== "OPEN" && t.assignedUserId);
  const taskSelection = useAdminSelection(filteredTasks.map((task) => task.id));

  const handleOpenAssignModal = (task: DeliveryTask) => {
    setAssigningTask(task);
    setSelectedTechId(task.assignedUserId || technicians[0]?.id || "");
    const todayStr = new Date().toISOString().split("T")[0];
    const nextThreeDaysStr = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    setStartDate(task.scheduledStartDate?.split("T")[0] || todayStr);
    setEndDate(task.scheduledEndDate?.split("T")[0] || nextThreeDaysStr);
    setAssignedEventLink(null);
    setIsAssignModalOpen(true);
  };

  const handleOpenBulkAssignModal = () => {
    const selectedTasks = filteredTasks.filter((task) => taskSelection.isSelected(task.id));
    if (selectedTasks.length === 0) return;
    handleOpenAssignModal(selectedTasks[0]);
  };

  const handleConfirmAssignment = async () => {
    if (!assigningTask || !selectedTechId || !startDate || !endDate) {
      toast.error("กรุณากรอกข้อมูลการมอบหมายงานให้ครบถ้วน");
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedStartDate = new Date(startDate);
      const parsedEndDate = new Date(endDate);
      if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime()) || parsedEndDate < parsedStartDate) {
        toast.error("กรุณาเลือกช่วงวันที่ที่ถูกต้อง");
        return;
      }

      const selectedTasks = filteredTasks.filter((task) => taskSelection.isSelected(task.id));
      const tasksToAssign = (selectedTasks.length > 0 ? selectedTasks : [assigningTask]).slice(0, 100);
      const settled = await Promise.allSettled(
        tasksToAssign.map(async (task) => ({
          task,
          result: await assignDeliveryTaskAction({
            taskId: task.id,
            technicianUserId: selectedTechId,
            startDate: parsedStartDate.toISOString(),
            endDate: parsedEndDate.toISOString(),
          }),
        })),
      );

      const successful = settled.flatMap((item) =>
        item.status === "fulfilled" && item.value.result.success ? [item.value] : [],
      );
      const failed = settled.length - successful.length;
      if (successful.length === 0) {
        const firstFailure = settled.find((item) => item.status === "fulfilled" && !item.value.result.success);
        toast.error(firstFailure && firstFailure.status === "fulfilled" ? firstFailure.value.result.error || "ไม่สามารถมอบหมายงานได้" : "ไม่สามารถมอบหมายงานได้");
        return;
      }

      const techObj = technicians.find((t) => t.id === selectedTechId);
      const successfulIds = new Set(successful.map(({ task }) => task.id));

      setTasks((prev) =>
        prev.map((t) =>
          successfulIds.has(t.id)
            ? {
                ...t,
                assignedUserId: selectedTechId,
                assignee: techObj || null,
                scheduledStartDate: startDate,
                scheduledEndDate: endDate,
                status: "SCHEDULED",
              }
            : t
        )
      );

      taskSelection.clear();
      if (successful.length === 1 && successful[0].result.eventLink) {
        setAssignedEventLink(successful[0].result.eventLink);
        toast.success("มอบหมายงานและสร้าง Google Calendar Event สำเร็จ!");
      } else {
        toast.success(`${successful.length} งานถูกมอบหมายทีมช่างเรียบร้อยแล้ว`);
        setIsAssignModalOpen(false);
      }
      if (failed > 0) {
        toast.error(`${failed} งานไม่สามารถมอบหมายได้`);
      }
    } catch (error) {
      console.error("Delivery task assignment error:", error);
      toast.error("ไม่สามารถมอบหมายงานได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#F0EEE9] p-4 md:p-8 text-slate-950 font-sans space-y-6">
      {/* Top Header & Console Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#0369a1]">
            <HardHat className="h-4 w-4" />
            <span>Post-Sales Delivery & Field Operations Console</span>
          </div>
          <h1 className="text-2xl font-black text-slate-950 tracking-tight">
            ระบบจัดสรรทีมช่างและตารางงานติดตั้ง (Task Dispatch Board)
          </h1>
          <p className="text-xs font-semibold text-slate-500 max-w-2xl">
            บริหารจัดการคิวงวดงาน ส่งทีมวิศวกรเข้าติดตั้ง เชื่อมต่อ Google Calendar & Google Drive และออกใบรับรองการส่งมอบงาน
          </p>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("gantt")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
              viewMode === "gantt" ? "bg-[#0F172A] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Gantt / Timeline</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
              viewMode === "calendar" ? "bg-[#0F172A] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Calendar</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
              viewMode === "list" ? "bg-[#0F172A] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>Projects List</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า, รหัสโครงการ หรือช่าง..."
            className="w-full pl-10 pr-4 py-2 bg-white rounded-xl border border-slate-200 text-xs text-slate-900 font-medium outline-none focus:border-[#0369a1] shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>วิศวกรพร้อมปฏิบัติงาน ({technicians.length} คน)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-amber-900 border border-amber-300">
            <Clock className="h-3.5 w-3.5" />
            <span>รอจัดสรรทีม ({unassignedTasks.length} งาน)</span>
          </span>
        </div>
      </div>

      <AdminBulkActionBar
        selectedCount={taskSelection.selectedCount}
        visibleCount={filteredTasks.length}
        allVisibleSelected={taskSelection.allVisibleSelected}
        someVisibleSelected={taskSelection.someVisibleSelected}
        onToggleVisible={taskSelection.toggleVisible}
        onClear={taskSelection.clear}
        isPending={isSubmitting}
        actions={[
          { id: "assign", label: "Assign selected", icon: UserCheck, tone: "success", onClick: handleOpenBulkAssignModal },
        ]}
      />

      {/* Main Board Layout: Unassigned Queue + Gantt Board */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Unassigned Work Orders Queue */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-slate-200">
            <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-600" />
              <span>คิวงวดงานรอจัดสรร ({unassignedTasks.length})</span>
            </h3>
          </div>

          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {unassignedTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs font-semibold text-slate-400 bg-white/50">
                ไม่มีงานค้างรอจัดสรรในขณะนี้
              </div>
            ) : (
              unassignedTasks.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3 shadow-2xs hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AdminSelectionCheckbox
                        checked={taskSelection.isSelected(t.id)}
                        onChange={() => taskSelection.toggle(t.id)}
                        label={`Select task ${t.title}`}
                      />
                      <span className="text-[10px] font-black uppercase font-mono bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-md">
                        {t.projectCode}
                      </span>
                    </div>
                    <StatusBadge tone="warning" className="text-[10px]">
                      รอเลือกช่าง
                    </StatusBadge>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-950">{t.title}</h4>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-600">
                      ลูกค้า: {t.customerName} ({t.systemSizeKwp} kWp)
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500 flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                      <span>{t.installationAddress}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenAssignModal(t)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F172A] hover:bg-[#0369a1] text-white py-2 text-xs font-black transition cursor-pointer shadow-2xs"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-[#B7D1EA]" />
                    <span>มอบหมายทีมช่าง & นัดหมาย</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right 3-Columns: Scheduled Work Orders Gantt / Timeline Board */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-slate-200">
            <h3 className="text-xs font-black uppercase text-slate-900 flex items-center gap-2">
              <HardHat className="h-4 w-4 text-[#0369a1]" />
              <span>ตารางการทำงานของทีมช่าง (Scheduled Field Tasks)</span>
            </h3>
            <span className="text-xs font-bold text-slate-500 font-mono">
              กำลังดำเนินงาน {scheduledTasks.length} งาน
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scheduledTasks.length === 0 ? (
              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs font-semibold text-slate-500 space-y-2">
                <Wrench className="h-8 w-8 text-slate-300 mx-auto" />
                <p>ยังไม่มีงานที่ถูกกำหนดตารางเวลา กรุณาเลือกงานจากคิวด้านซ้ายเพื่อมอบหมายทีมช่าง</p>
              </div>
            ) : (
              scheduledTasks.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs hover:border-[#0369a1] transition"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <AdminSelectionCheckbox
                        checked={taskSelection.isSelected(t.id)}
                        onChange={() => taskSelection.toggle(t.id)}
                        label={`Select task ${t.title}`}
                      />
                      <span className="h-8 w-8 rounded-full bg-[#0F172A] text-white font-black text-xs flex items-center justify-center">
                        {t.sequence}
                      </span>
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase font-mono">
                          {t.projectCode}
                        </span>
                        <h4 className="text-xs font-black text-slate-950 truncate max-w-[200px]">
                          {t.title}
                        </h4>
                      </div>
                    </div>
                    <StatusBadge tone={getStatusTone(t.status)} className="text-[10px]">
                      {t.status}
                    </StatusBadge>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-semibold">ผู้รับบริการ:</span>
                      <span className="font-bold text-slate-900">{t.customerName}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-semibold">ขนาดระบบ:</span>
                      <span className="font-bold text-[#0369a1]">{t.systemSizeKwp} kWp Solar</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-semibold">ทีมช่างผู้รับผิดชอบ:</span>
                      <span className="font-black text-slate-900 inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-[#0369a1]" />
                        {t.assignee?.name || "ทีมวิศวกร SolarDream"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="font-semibold">กำหนดวันเข้างาน:</span>
                      <span className="font-mono text-slate-700">
                        {t.scheduledStartDate ? new Date(t.scheduledStartDate).toLocaleDateString("th-TH") : "TBD"}
                      </span>
                    </div>
                  </div>

                  {/* Actions & Links */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <a
                      href={`/${locale}/tech/work-orders/${t.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-black text-[#0369a1] hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>เปิดใบสั่งงานช่าง (Work Order)</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleOpenAssignModal(t)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                    >
                      เปลี่ยนช่าง/วัน
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Task Assignment Modal with Google Calendar Sync */}
      <Dialog isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} size="md">
        <DialogContent className="bg-white text-slate-950 max-w-lg border border-slate-200 shadow-2xl p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="border-b border-slate-100 bg-[#0F172A] px-6 py-4 flex flex-row items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[#B7D1EA]" />
              <h2 className="text-base font-black">
                มอบหมายงานและนัดหมายทีมช่าง (Task Dispatch)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsAssignModalOpen(false)}
              className="rounded-xl p-1 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogHeader>

          <DialogBody className="p-6 space-y-4 text-xs">
            {assigningTask && (
              <div className="p-3 bg-[#F5F2EB] rounded-xl border border-slate-200 space-y-1">
                <p className="font-black text-slate-900 text-sm">{assigningTask.title}</p>
                <p className="font-semibold text-slate-600">
                  ลูกค้า: {assigningTask.customerName} ({assigningTask.systemSizeKwp} kWp)
                </p>
                <p className="text-[11px] text-slate-500 font-mono">สถานที่: {assigningTask.installationAddress}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">เลือกทีมวิศวกร / หัวหน้าช่าง:</label>
              <select
                value={selectedTechId}
                onChange={(e) => setSelectedTechId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 font-bold bg-white outline-none focus:border-[#0369a1]"
              >
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name} ({tech.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">วันที่เริ่มต้นเข้างาน:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold text-slate-900 outline-none focus:border-[#0369a1]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">วันที่คาดว่าส่งมอบ:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2 text-xs font-bold text-slate-900 outline-none focus:border-[#0369a1]"
                />
              </div>
            </div>

            {assignedEventLink && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1 text-emerald-900">
                <p className="font-black text-xs flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  สร้าง Google Calendar Event สำเร็จ!
                </p>
                <a
                  href={assignedEventLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-emerald-700 underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  เปิดดูนัดหมายบน Google Calendar
                </a>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleConfirmAssignment}
                disabled={isSubmitting}
                className="rounded-xl bg-[#0F172A] hover:bg-[#0369a1] px-5 py-2 font-black text-white transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "กำลังซิงค์ Google Calendar..." : "ยืนยันและซิงค์นัดหมาย"}
              </button>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
