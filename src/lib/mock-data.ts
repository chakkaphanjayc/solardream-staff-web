import { Component } from "@/types";

export const MOCK_COMPONENTS: Component[] = [
  // CPU
  {
    id: "cpu-1",
    name: "Intel Core i9-14900K",
    category: "CPU",
    price: 589,
    imageUrl: "/images/cpu.png",
    description: "24 cores (8 P-cores + 16 E-cores) and 32 threads. Up to 6.0 GHz.",
  },
  {
    id: "cpu-2",
    name: "AMD Ryzen 9 7950X",
    category: "CPU",
    price: 549,
    imageUrl: "/images/cpu.png",
    description: "16 cores and 32 threads. Base clock 4.5 GHz, boost up to 5.7 GHz.",
  },
  // GPU
  {
    id: "gpu-1",
    name: "NVIDIA GeForce RTX 4090",
    category: "GPU",
    price: 1599,
    imageUrl: "/images/gpu.png",
    description: "The ultimate GeForce GPU. It brings an enormous leap in performance, efficiency, and AI-powered graphics.",
  },
  {
    id: "gpu-2",
    name: "AMD Radeon RX 7900 XTX",
    category: "GPU",
    price: 949,
    imageUrl: "/images/gpu.png",
    description: "Experience unprecedented performance, visuals, and efficiency at 4K and beyond.",
  },
  // RAM
  {
    id: "ram-1",
    name: "Corsair Vengeance RGB 32GB DDR5",
    category: "RAM",
    price: 120,
    imageUrl: "https://placehold.co/400x400/png?text=Corsair+RAM",
    description: "DDR5 memory optimized for Intel motherboards, with dynamic ten-zone RGB lighting.",
  },
  // Case
  {
    id: "case-1",
    name: "Lian Li PC-O11 Dynamic",
    category: "Case",
    price: 150,
    imageUrl: "/images/case.png",
    description: "The O11 Dynamic is a combination of modern design and art.",
  },

  {
    id: "case-2",
    name: "NZXT H7 Elite",
    category: "Case",
    price: 180,
    imageUrl: "/images/nzxt-h7.png",
    description: "A premium mid-tower case with tempered glass panels and built-in RGB controller.",
  },
];

export const CATEGORIES: Component['category'][] = ["Case", "CPU", "GPU", "RAM", "Storage", "Power Supply"];
