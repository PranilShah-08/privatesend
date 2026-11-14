use clap::{Parser, Subcommand};
use lossless_core::{
    hash_file, verify_file, BatchHasher, ChunkReassembler, MultiFileSlicer, SecureBuffer,
    StreamingChunker, DEFAULT_CHUNK_SIZE,
};
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

#[derive(Parser, Debug)]
#[command(
    name = "lossless-core",
    author = "LosslessDrop Core Team",
    version = "0.1.0",
    about = "High-performance streaming SHA-256 verifier & zero-copy WebRTC chunker with zero persistence",
    long_about = None
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Computes streaming bit-for-bit SHA-256 hex digest of a file or stdin ("-")
    Hash {
        /// File path to hash, or "-" for stdin
        file: PathBuf,
    },

    /// Verifies that a file or stdin ("-") matches expected SHA-256 digest bit-for-bit
    Verify {
        /// File path to verify, or "-" for stdin
        file: PathBuf,

        /// 64-character hex-encoded SHA-256 expected hash
        expected_hash: String,
    },

    /// Slices a file into 64KB WebRTC chunks with 4-byte big-endian sequence header
    Chunk {
        /// Source file path, or "-" for stdin
        file: PathBuf,

        /// Output prefix for chunks (creates <output-prefix>.<index>)
        output_prefix: PathBuf,

        /// Optional custom chunk size in bytes (defaults to 65536 = 64KB)
        #[arg(short, long, default_value_t = DEFAULT_CHUNK_SIZE)]
        chunk_size: usize,
    },

    /// Reassembles chunks generated with prefix into the original file or stdout ("-")
    Reassemble {
        /// Input prefix for chunks (looks for <input-prefix>.<index>)
        input_prefix: PathBuf,

        /// Output destination path, or "-" for stdout
        #[arg(short, long)]
        output: PathBuf,

        /// Total expected chunks count
        #[arg(short, long)]
        total: Option<u32>,
    },

    /// Computes streaming bit-for-bit SHA-256 digests for multiple files (outputs JSON array)
    HashBatch {
        /// File paths to hash
        #[arg(required = true)]
        files: Vec<PathBuf>,
    },

    /// Batch slices multiple files into WebRTC chunks in an output directory (outputs JSON report)
    SliceBatch {
        /// File paths to slice
        #[arg(required = true)]
        files: Vec<PathBuf>,

        /// Directory where chunks will be written
        #[arg(short, long)]
        output_dir: PathBuf,

        /// Optional custom chunk size in bytes (defaults to 65536 = 64KB)
        #[arg(short, long, default_value_t = DEFAULT_CHUNK_SIZE)]
        chunk_size: usize,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    match execute(cli.command) {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("Error: {}", err);
            ExitCode::FAILURE
        }
    }
}

fn execute(cmd: Commands) -> Result<(), Box<dyn std::error::Error>> {
    match cmd {
        Commands::Hash { file } => {
            let hash = hash_file(&file)?;
            println!("{}", hash);
            Ok(())
        }

        Commands::Verify {
            file,
            expected_hash,
        } => match verify_file(&file, &expected_hash) {
            Ok(()) => {
                eprintln!("OK: 100% bit-for-bit SHA-256 match");
                Ok(())
            }
            Err(err) => Err(Box::new(err)),
        },

        Commands::Chunk {
            file,
            output_prefix,
            chunk_size,
        } => {
            let mut chunk_buffer = SecureBuffer::new();
            let mut total_chunks = 0u32;
            let mut total_bytes = 0u64;

            if file == Path::new("-") {
                let stdin = io::stdin().lock();
                let mut chunker = StreamingChunker::with_chunk_size(stdin, chunk_size);
                while let Some(index) = chunker.read_next_chunk(&mut chunk_buffer)? {
                    let out_path = format!("{}.{}", output_prefix.display(), index);
                    fs::write(&out_path, &chunk_buffer)?;
                    total_chunks += 1;
                    total_bytes += chunk_buffer.len().saturating_sub(4) as u64;
                }
            } else {
                let f = File::open(&file)?;
                let reader = BufReader::new(f);
                let mut chunker = StreamingChunker::with_chunk_size(reader, chunk_size);
                while let Some(index) = chunker.read_next_chunk(&mut chunk_buffer)? {
                    let out_path = format!("{}.{}", output_prefix.display(), index);
                    fs::write(&out_path, &chunk_buffer)?;
                    total_chunks += 1;
                    total_bytes += chunk_buffer.len().saturating_sub(4) as u64;
                }
            }

            eprintln!(
                "Successfully sliced {} bytes into {} WebRTC chunks at prefix: {}",
                total_bytes,
                total_chunks,
                output_prefix.display()
            );
            Ok(())
        }

        Commands::Reassemble {
            input_prefix,
            output,
            total,
        } => {
            let mut reassembler = match total {
                Some(t) => ChunkReassembler::with_total_chunks(t),
                None => ChunkReassembler::new(),
            };

            // Read sequentially or glob chunks with prefix.<index>
            let mut index = 0u32;
            loop {
                if let Some(t) = total {
                    if index >= t {
                        break;
                    }
                }
                let chunk_path = format!("{}.{}", input_prefix.display(), index);
                if !Path::new(&chunk_path).exists() {
                    if total.is_some() {
                        return Err(format!("Missing expected chunk file: {}", chunk_path).into());
                    }
                    break;
                }

                let chunk_bytes = fs::read(&chunk_path)?;
                reassembler.add_packed_chunk(&chunk_bytes)?;
                index += 1;
            }

            if total.is_none() {
                reassembler.set_total_chunks(index);
            }

            if output == Path::new("-") {
                let mut stdout = io::stdout().lock();
                let mut writer = BufWriter::new(&mut stdout);
                let bytes = reassembler.drain_contiguous(&mut writer)?;
                writer.flush()?;
                eprintln!("Reassembled {} bytes to stdout", bytes);
            } else {
                let f = File::create(&output)?;
                let mut writer = BufWriter::new(f);
                let bytes = reassembler.drain_contiguous(&mut writer)?;
                writer.flush()?;
                eprintln!(
                    "Reassembled {} bytes successfully into {}",
                    bytes,
                    output.display()
                );
            }

            Ok(())
        }

        Commands::HashBatch { files } => {
            let entries = BatchHasher::hash_files(&files)?;
            let json = serde_json::to_string_pretty(&entries)?;
            println!("{}", json);
            Ok(())
        }

        Commands::SliceBatch {
            files,
            output_dir,
            chunk_size,
        } => {
            let slicer = MultiFileSlicer::new(chunk_size);
            let report = slicer.slice_files_to_dir(&files, &output_dir)?;
            let json = serde_json::to_string_pretty(&report)?;
            println!("{}", json);
            Ok(())
        }
    }
}
