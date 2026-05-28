import { HugeiconsIcon } from '@hugeicons/react';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import AddToListIcon from '@hugeicons/core-free-icons/AddToListIcon';
import AlertCircleIcon from '@hugeicons/core-free-icons/AlertCircleIcon';
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import Calendar03Icon from '@hugeicons/core-free-icons/Calendar03Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import CheckmarkCircle01Icon from '@hugeicons/core-free-icons/CheckmarkCircle01Icon';
import CheckmarkSquare01Icon from '@hugeicons/core-free-icons/CheckmarkSquare01Icon';
import File01Icon from '@hugeicons/core-free-icons/File01Icon';
import FileCodeIcon from '@hugeicons/core-free-icons/FileCodeIcon';
import FileUnknownIcon from '@hugeicons/core-free-icons/FileUnknownIcon';
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon';
import FolderOpenIcon from '@hugeicons/core-free-icons/FolderOpenIcon';
import Layers01Icon from '@hugeicons/core-free-icons/Layers01Icon';
import MinusSignIcon from '@hugeicons/core-free-icons/MinusSignIcon';
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon';
import NoteAddIcon from '@hugeicons/core-free-icons/NoteAddIcon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import Settings01Icon from '@hugeicons/core-free-icons/Settings01Icon';
import SquareStackIcon from '@hugeicons/core-free-icons/SquareStackIcon';
import Task01Icon from '@hugeicons/core-free-icons/Task01Icon';
import TaskDone01Icon from '@hugeicons/core-free-icons/TaskDone01Icon';
import ViewSidebarLeftIcon from '@hugeicons/core-free-icons/ViewSidebarLeftIcon';

function createIcon(icon) {
  return function DaoIcon({ size = 18, strokeWidth = 1.8, ...props }) {
    return <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} {...props} />;
  };
}

export const AddIcon = createIcon(Add01Icon);
export const AddNotesIcon = createIcon(NoteAddIcon);
export const ArrowDownIcon = createIcon(ArrowDown01Icon);
export const ArrowRightIcon = createIcon(ArrowRight01Icon);
export const CalendarIcon = createIcon(Calendar03Icon);
export const CheckIcon = createIcon(CheckmarkSquare01Icon);
export const CheckCircleIcon = createIcon(CheckmarkCircle01Icon);
export const CloseIcon = createIcon(Cancel01Icon);
export const ErrorIcon = createIcon(AlertCircleIcon);
export const ExtensionIcon = createIcon(Layers01Icon);
export const FileIcon = createIcon(File01Icon);
export const FolderIcon = createIcon(Folder01Icon);
export const FolderOpenIconComponent = createIcon(FolderOpenIcon);
export const MarkdownIcon = createIcon(FileCodeIcon);
export const MoreHorizontalIconComponent = createIcon(MoreHorizontalIcon);
export const RemoveIcon = createIcon(MinusSignIcon);
export const SearchIcon = createIcon(Search01Icon);
export const SettingsIcon = createIcon(Settings01Icon);
export const SidebarIcon = createIcon(ViewSidebarLeftIcon);
export const StacksIcon = createIcon(SquareStackIcon);
export const TaskIcon = createIcon(Task01Icon);
export const TaskDoneIcon = createIcon(TaskDone01Icon);
export const UnknownDocumentIcon = createIcon(FileUnknownIcon);
export const AddToListIconComponent = createIcon(AddToListIcon);
