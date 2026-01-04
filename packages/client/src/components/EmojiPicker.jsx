import { useState, useEffect, useRef } from "react";
import clsx from "clsx";

const EMOJI_CATEGORIES = {
	"😊": {
		name: "Smileys",
		emojis: [
			"😀",
			"😃",
			"😄",
			"😁",
			"😆",
			"😅",
			"😂",
			"🤣",
			"😊",
			"😇",
			"🙂",
			"🙃",
			"😉",
			"😌",
			"😍",
			"🥰",
			"😘",
			"😗",
			"😙",
			"😚",
			"😋",
			"😛",
			"😝",
			"😜",
			"🤪",
			"🤨",
			"🧐",
			"🤓",
			"😎",
			"🤩",
			"🥳",
			"😏",
			"😒",
			"😞",
			"😔",
			"😟",
			"😕",
			"🙁",
			"☹️",
			"😣",
			"😖",
			"😫",
			"😩",
			"🥺",
			"😢",
			"😭",
			"😤",
			"😠",
			"😡",
		],
	},
	"🙏": {
		name: "Gestures",
		emojis: [
			"👐",
			"🙌",
			"👏",
			"🙏",
			"🤝",
			"👍",
			"👎",
			"👊",
			"✊",
			"🤛",
			"🤜",
			"🤞",
			"✌️",
			"🤟",
			"🤘",
			"👌",
			"👈",
			"👉",
			"👆",
			"👇",
			"☝️",
			"✋",
			"🤚",
			"🖐️",
			"🖖",
			"👋",
			"🤙",
			"💪",
		],
	},
	"❤️": {
		name: "Hearts",
		emojis: [
			"❤️",
			"🧡",
			"💛",
			"💚",
			"💙",
			"💜",
			"🖤",
			"🤍",
			"🤎",
			"💔",
			"💕",
			"💞",
			"💓",
			"💗",
			"💖",
			"💘",
			"💝",
			"💟",
			"💌",
		],
	},
	"🎉": {
		name: "Celebration",
		emojis: [
			"🎉",
			"🎊",
			"🎈",
			"🎀",
			"🎁",
			"🏆",
			"🏅",
			"🥇",
			"🥈",
			"🥉",
			"⭐️",
			"🌟",
			"✨",
			"💫",
			"🔥",
			"💥",
			"⚡️",
			"💯",
			"🎯",
		],
	},
};

export default function EmojiPicker({ onSelect, onClose }) {
	const [activeCategory, setActiveCategory] = useState("😊");
	const pickerRef = useRef(null);

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (pickerRef.current && !pickerRef.current.contains(e.target)) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
	}, [onClose]);

	return (
		<div
			ref={pickerRef}
			className="absolute bottom-full left-0 mb-2 bg-surface border border-white/10 rounded-xl p-3 shadow-2xl w-72 animate-fade-in z-50">
			{/* Category tabs */}
			<div className="flex gap-1 mb-2 pb-2 border-b border-white/10">
				{Object.keys(EMOJI_CATEGORIES).map((cat) => (
					<button
						key={cat}
						onClick={() => setActiveCategory(cat)}
						className={clsx(
							"p-1.5 rounded-lg text-lg transition-colors",
							activeCategory === cat ? "bg-white/10" : "hover:bg-white/5"
						)}>
						{cat}
					</button>
				))}
			</div>

			{/* Emoji grid */}
			<div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto hide-scrollbar">
				{EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, idx) => (
					<button
						key={idx}
						onClick={() => onSelect(emoji)}
						className="p-1.5 text-xl hover:bg-white/10 rounded-lg transition-colors">
						{emoji}
					</button>
				))}
			</div>
		</div>
	);
}
