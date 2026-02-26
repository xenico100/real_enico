'use client';

import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';

export interface Collection {
  id: string;
  title: string;
  season: string;
  description: string;
  image: string;
  images: string[];
  items: number;
  releaseDate: string;
  fullDescription: string;
}

const collections: Collection[] = [
  {
    id: 'COL-001',
    title: 'DIGITAL INSURGENCY',
    season: 'AW 2026',
    description: 'Encrypted fashion for the underground resistance',
    image: 'https://images.unsplash.com/photo-1558769132-cb1aea3c8a76?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBmYXNoaW9uJTIwZWRpdG9yaWFsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
    images: [
      'https://images.unsplash.com/photo-1558769132-cb1aea3c8a76?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBmYXNoaW9uJTIwZWRpdG9yaWFsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1504593811423-6dd665756598?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    ],
    items: 24,
    releaseDate: '2026.09.15',
    fullDescription: 'Born from the depths of digital rebellion, this collection merges military-grade functionality with avant-garde design. Each piece is a statement against conformity, encrypted with forbidden techniques and constructed for those who dare to exist outside the system.',
  },
  {
    id: 'COL-002',
    title: 'NEON WASTELAND',
    season: 'SS 2027',
    description: 'Post-apocalyptic luxury from the ruins of civilization',
    image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxuZW9uJTIwbGlnaHRzJTIwZmFzaGlvbnxlbnwwfHx8fDE3Mzg2OTU2NzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    images: [
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxuZW9uJTIwbGlnaHRzJTIwZmFzaGlvbnxlbnwwfHx8fDE3Mzg2OTU2NzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1445205170230-053b83016050?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    ],
    items: 18,
    releaseDate: '2027.03.20',
    fullDescription: 'Scavenged from the electromagnetic wastelands of tomorrow. Bio-luminescent fabrics, self-repairing nano-textiles, and radiation-resistant coatings. This collection represents the evolution of survival fashion.',
  },
  {
    id: 'COL-003',
    title: 'GHOST PROTOCOL',
    season: 'AW 2026',
    description: 'Invisible to surveillance, visible to the enlightened',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZmFzaGlvbiUyMG1vZGVsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
    images: [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZmFzaGlvbiUyMG1vZGVsfGVufDB8fHx8MTczODY5NTY3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
      'https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
    ],
    items: 15,
    releaseDate: '2026.11.11',
    fullDescription: 'Engineered for those who move between shadows. Anti-facial recognition patterns, thermal signature disruption, and acoustic dampening materials. Each garment is designed to make you disappear in plain sight.',
  },
];

interface CollectionSectionProps {
  onCollectionClick: (collection: Collection) => void;
}

export function CollectionSection({ onCollectionClick }: CollectionSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <section id="collection-section" className="py-20 bg-[#e5e5e5] text-black relative overflow-hidden scroll-mt-24" ref={containerRef}>
      
      {/* Tape/Paper Background Effect */}
      <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/crumpled-paper.png')]" />

      <div className="px-6 md:px-12 relative z-10">
        <div className="mb-6 inline-flex items-center gap-3 border-2 border-black bg-white/90 px-3 py-2">
          <span className="font-mono text-[10px] tracking-[0.2em] text-black">SECTION_02</span>
          <span className="h-3 w-px bg-black/30" />
          <span className="font-mono text-[11px] tracking-[0.18em] text-black">COLLECTION</span>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-end mb-20 border-b-4 border-black pb-4">
          <div>
            <h2 className="text-7xl md:text-9xl font-black font-heading uppercase tracking-tighter leading-[0.8]">
              COLLECTION
            </h2>
            <p className="font-mono text-xs md:text-sm uppercase tracking-[0.18em] mt-2 text-black/60">
              /// WHITE BOARD POSTS / CURATED ARCHIVE
            </p>
          </div>
          <p className="font-mono text-sm uppercase tracking-widest mb-2 bg-black text-white px-2">
            /// DO NOT DISTRIBUTE
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {collections.map((collection, index) => (
            <motion.div
              key={collection.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              onClick={() => onCollectionClick(collection)}
              className="group cursor-pointer relative"
            >
              {/* Paper Stack Effect */}
              <div className="absolute top-2 left-2 w-full h-full bg-black/10 -z-10 rotate-2 group-hover:rotate-4 transition-transform duration-300" />
              <div className="absolute top-4 left-4 w-full h-full bg-black/5 -z-20 rotate-4 group-hover:rotate-6 transition-transform duration-300" />
              
              <div className="bg-white p-4 border-2 border-black h-full flex flex-col justify-between relative shadow-xl">
                
                {/* Image Area */}
                <div className="relative aspect-[4/5] overflow-hidden border border-black mb-6">
                   <div className="absolute inset-0 bg-[#00ffd1] mix-blend-multiply opacity-0 group-hover:opacity-40 transition-opacity duration-300 z-10" />
                   <img 
                     src={collection.image} 
                     alt={collection.title}
                     className="w-full h-full object-cover grayscale contrast-125 group-hover:scale-110 transition-transform duration-700"
                   />
                   
                   {/* "STAMP" */}
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-4 border-[#00ffd1] rounded-full flex items-center justify-center -rotate-12 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 mix-blend-hard-light">
                     <span className="text-[#00ffd1] font-heading font-bold text-xl uppercase text-center leading-none">
                       CONFIDENTIAL<br/>EVIDENCE
                     </span>
                   </div>
                </div>

                {/* Text Area */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center border-b border-black pb-2">
                    <span className="font-mono text-xs font-bold bg-black text-white px-1">CASE #{collection.id}</span>
                    <span className="font-mono text-xs text-gray-500">{collection.season}</span>
                  </div>
                  
                  <h3 className="text-3xl font-heading uppercase leading-none break-words group-hover:text-[#00ffd1] transition-colors">
                    {collection.title}
                  </h3>
                  
                  <p className="font-mono text-xs leading-relaxed text-gray-600 line-clamp-3">
                    {collection.description}
                  </p>

                  <div className="pt-4 flex justify-end">
                    <span className="text-xs font-bold font-mono underline decoration-2 decoration-[#00ffd1] group-hover:bg-[#00ffd1] group-hover:text-black group-hover:no-underline px-1 transition-all">
                      VIEW DOSSIER →
                    </span>
                  </div>
                </div>

                {/* Tape Effect */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-8 bg-[#e5e5e5] opacity-80 rotate-[-2deg] shadow-sm z-30" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
