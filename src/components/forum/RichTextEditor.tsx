"use client";

import { adminUploadArticleImage } from "@/app/actions/articles";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Link2,
  Image as ImageIcon,
  Unlink,
  Heading1,
  Heading2,
  Heading3,
  Code,
  Upload,
  X,
} from "@/components/ui/icons";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { GsapReveal } from "@/components/ui/GsapMotion";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

// ─── Modal: Image Upload & URL Input ──────────────────────────
interface ImageInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
}

function ImageInsertModal({ isOpen, onClose, onInsert }: ImageInsertModalProps) {
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  if (!isOpen || typeof document === "undefined") return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (tab === "upload" && file) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await adminUploadArticleImage(formData);
        if (res.success && res.url) {
          onInsert(res.url);
          onClose();
        } else if (res.error) {
          toast.error(res.error);
        }
      } catch {
        toast.error("Image upload failed");
      } finally {
        setIsUploading(false);
      }
    } else if (tab === "url" && url.trim()) {
      onInsert(url.trim());
      setUrl("");
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />
      <GsapReveal className="relative z-10 w-full max-w-md">
        <form
          onSubmit={handleSubmit}
          onClick={(event) => event.stopPropagation()}
          className="bg-[#0F172A] border border-[#1E293B] text-white w-full rounded-2xl shadow-2xl p-6 space-y-4"
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Insert Article Image
          </h3>

          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setTab("upload")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                tab === "upload" ? "bg-[#B7D1EA] text-[#0F172A]" : "text-slate-400 hover:text-white"
              }`}
            >
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setTab("url")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                tab === "url" ? "bg-[#B7D1EA] text-[#0F172A]" : "text-slate-400 hover:text-white"
              }`}
            >
              Image URL
            </button>
          </div>

          {tab === "upload" ? (
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Select Image File (Max 10MB)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full bg-[#0B1121] border border-slate-800 rounded-xl p-3 text-xs text-white file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#B7D1EA] file:text-[#0F172A] hover:file:bg-[#99BFE3] cursor-pointer"
                required
              />
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Image CDN URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="w-full bg-[#0B1121] border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
                required
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white border border-slate-800 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || (tab === "upload" && !file) || (tab === "url" && !url.trim())}
              className="px-5 py-2.5 text-xs font-black uppercase tracking-wider bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? "Uploading..." : "Insert Image"}
            </button>
          </div>
        </form>
      </GsapReveal>
    </div>,
    document.body
  );
}

// ─── Modal: Link URL Input ───────────────────────────────────
interface LinkInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
  initialValue: string;
}

function LinkInsertModal({ isOpen, onClose, onInsert, initialValue }: LinkInsertModalProps) {
  const [url, setUrl] = useState(initialValue);

  if (!isOpen || typeof document === "undefined") return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onInsert(url.trim());
    setUrl("");
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />
      <GsapReveal className="relative z-10 w-full max-w-md">
        <form
          onSubmit={handleSubmit}
          onClick={(event) => event.stopPropagation()}
          className="bg-[#0F172A] border border-[#1E293B] text-white w-full rounded-2xl shadow-2xl p-6 space-y-4"
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-sm font-black text-white uppercase tracking-wider">
            Insert Hyperlink
          </h3>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
              URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-[#0B1121] border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#B7D1EA]"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white border border-slate-800 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-black uppercase tracking-wider bg-[#B7D1EA] hover:bg-[#99BFE3] text-[#0F172A] rounded-xl transition-all cursor-pointer"
            >
              Insert Link
            </button>
          </div>
        </form>
      </GsapReveal>
    </div>,
    document.body
  );
}

// ─── Main Enterprise Editor Component ──────────────────────────
export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkInitialUrl, setLinkInitialUrl] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-[#B7D1EA] underline cursor-pointer font-bold",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full rounded-xl border border-slate-800 my-4 shadow-md",
        },
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-invert max-w-none focus:outline-none min-h-[220px] outline-none text-sm text-slate-100 p-4 leading-relaxed",
      },
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  const handleLinkInsert = (url: string) => {
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const handleImageInsert = (url: string) => {
    editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="w-full bg-[#0B1121] border border-slate-800 rounded-xl overflow-hidden focus-within:border-[#B7D1EA] transition-all shadow-xl">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 bg-[#0F172A] border-b border-slate-800 p-2 select-none">
        {/* Headings */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("heading", { level: 1 }) ? "bg-[#B7D1EA] text-[#0F172A] font-bold" : "text-slate-400 hover:text-white"
          }`}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("heading", { level: 2 }) ? "bg-[#B7D1EA] text-[#0F172A] font-bold" : "text-slate-400 hover:text-white"
          }`}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("heading", { level: 3 }) ? "bg-[#B7D1EA] text-[#0F172A] font-bold" : "text-slate-400 hover:text-white"
          }`}
          title="Heading 3"
        >
          <Heading3 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-800 mx-1" />

        {/* Text Formatting */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("bold") ? "bg-[#B7D1EA] text-[#0F172A] font-bold" : "text-slate-400 hover:text-white"
          }`}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("italic") ? "bg-[#B7D1EA] text-[#0F172A]" : "text-slate-400 hover:text-white"
          }`}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("underline") ? "bg-[#B7D1EA] text-[#0F172A]" : "text-slate-400 hover:text-white"
          }`}
          title="Underline"
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("codeBlock") ? "bg-[#B7D1EA] text-[#0F172A]" : "text-slate-400 hover:text-white"
          }`}
          title="Code Block"
        >
          <Code className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-800 mx-1" />

        {/* Lists & Quotes */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("bulletList") ? "bg-[#B7D1EA] text-[#0F172A]" : "text-slate-400 hover:text-white"
          }`}
          title="Bulleted List"
        >
          <List className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("orderedList") ? "bg-[#B7D1EA] text-[#0F172A]" : "text-slate-400 hover:text-white"
          }`}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("blockquote") ? "bg-[#B7D1EA] text-[#0F172A]" : "text-slate-400 hover:text-white"
          }`}
          title="Blockquote"
        >
          <Quote className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-800 mx-1" />

        {/* Media & Links */}
        <button
          type="button"
          onClick={() => {
            setLinkInitialUrl(editor.getAttributes("link").href || "");
            setLinkModalOpen(true);
          }}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            editor.isActive("link") ? "bg-[#B7D1EA] text-[#0F172A]" : "text-slate-400 hover:text-white"
          }`}
          title="Insert Link"
        >
          <Link2 className="w-4 h-4" />
        </button>

        {editor.isActive("link") && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetLink().run()}
            className="p-1.5 rounded-lg transition-all text-red-400 hover:bg-red-950/40 cursor-pointer"
            title="Remove Link"
          >
            <Unlink className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => setImageModalOpen(true)}
          className="flex items-center gap-1 p-1.5 rounded-lg transition-all text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          title="Upload or Insert Image"
        >
          <ImageIcon className="w-4 h-4" />
          <Upload className="w-3 h-3 text-[#B7D1EA]" />
        </button>
      </div>

      {/* Editor Content Area */}
      <EditorContent editor={editor} />

      {/* Custom Portalled Modals */}
      {linkModalOpen && (
        <LinkInsertModal
          key={linkInitialUrl}
          isOpen={linkModalOpen}
          initialValue={linkInitialUrl}
          onClose={() => setLinkModalOpen(false)}
          onInsert={handleLinkInsert}
        />
      )}

      {imageModalOpen && (
        <ImageInsertModal
          isOpen={imageModalOpen}
          onClose={() => setImageModalOpen(false)}
          onInsert={handleImageInsert}
        />
      )}
    </div>
  );
}
