import React, { useState, useRef } from "react";
import axios from "axios";

interface ReceiptUploadProps {
	onReceiptProcessed: (items: { name: string; price: number }[]) => void;
	loading: boolean;
	setLoading: (loading: boolean) => void;
	setError: (error: string) => void;
}

const ReceiptUpload: React.FC<ReceiptUploadProps> = ({
	onReceiptProcessed,
	loading,
	setLoading,
	setError,
}) => {
	const [uploadedImage, setUploadedImage] = useState<File | null>(null);
	const [previewURL, setPreviewURL] = useState<string | null>(null);
	const [scanningStatus, setScanningStatus] = useState<string>("");
	const [processingMethod, setProcessingMethod] = useState<string>("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			// Validate file is an image
			if (!file.type.match("image.*")) {
				setError("Please select an image file");
				return;
			}

			setUploadedImage(file);
			setPreviewURL(URL.createObjectURL(file));
		}
	};

	const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();

		if (event.dataTransfer.files && event.dataTransfer.files[0]) {
			const file = event.dataTransfer.files[0];

			// Validate file is an image
			if (!file.type.match("image.*")) {
				setError("Please drop an image file");
				return;
			}

			setUploadedImage(file);
			setPreviewURL(URL.createObjectURL(file));
		}
	};

	const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
	};

	const uploadToServer = async () => {
		if (!uploadedImage) return;

		setLoading(true);
		setScanningStatus("Uploading and analyzing receipt...");
		setProcessingMethod("Using advanced AI vision analysis...");

		const formData = new FormData();
		formData.append("receipt", uploadedImage);

		try {
			const response = await axios.post("/api/scan-receipt", formData, {
				headers: {
					"Content-Type": "multipart/form-data",
				},
			});

			if (response.data.items && response.data.items.length > 0) {
				onReceiptProcessed(response.data.items);
				setScanningStatus("Receipt processed successfully!");
				setProcessingMethod("");
			} else {
				setError("No items could be detected in the receipt");
				setScanningStatus("");
				setProcessingMethod("");
			}
		} catch (err: any) {
			console.error("Error processing receipt:", err);
			setError(err.response?.data?.error || "Failed to process receipt");
			setScanningStatus("");
			setProcessingMethod("");
		} finally {
			setLoading(false);
		}
	};

	const handleProcessClick = () => {
		if (uploadedImage) {
			uploadToServer();
		} else {
			setError("Please upload a receipt image first");
		}
	};

	return (
		<div className="section">
			<h2>Upload Receipt</h2>
			<p className="feature-note">
				Using Google Gemini Vision AI for advanced receipt scanning
			</p>
			<div
				className="upload-area"
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onClick={() => fileInputRef.current?.click()}
			>
				<input
					type="file"
					ref={fileInputRef}
					onChange={handleFileChange}
					accept="image/*"
					style={{ display: "none" }}
				/>
				<p>Click to browse or drop receipt image here</p>
				{previewURL && (
					<img
						src={previewURL}
						alt="Receipt preview"
						className="receipt-preview"
					/>
				)}
			</div>

			<div style={{ marginTop: "15px", textAlign: "center" }}>
				<button
					onClick={handleProcessClick}
					disabled={!uploadedImage || loading}
				>
					Scan Receipt
				</button>
				{uploadedImage && (
					<button
						onClick={() => {
							setUploadedImage(null);
							setPreviewURL(null);
							setScanningStatus("");
							setProcessingMethod("");
						}}
						disabled={loading}
					>
						Clear
					</button>
				)}
			</div>

			{loading && (
				<div className="loading">
					<div className="loading-spinner"></div>
					<p>{scanningStatus}</p>
					{processingMethod && (
						<p className="processing-method">{processingMethod}</p>
					)}
				</div>
			)}

			{scanningStatus && !loading && (
				<p style={{ color: "green", textAlign: "center" }}>
					{scanningStatus}
				</p>
			)}
		</div>
	);
};

export default ReceiptUpload;
