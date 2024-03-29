import { ChangeEvent, DragEvent, useEffect, useState } from 'react';
import { useServers } from '../utils/useServers';
import { BlossomClient } from 'blossom-client-sdk';
import { useNDK } from '../ndk';
import { useServerInfo } from '../utils/useServerInfo';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpOnSquareIcon } from '@heroicons/react/24/outline';
import ProgressBar from '../components/ProgressBar/ProgressBar';
import { removeExifData } from '../exif';

type TransferStats = {
  enabled: boolean;
  size: number;
  transferred: number;
};

function Upload() {
  const servers = useServers();
  const { signEventTemplate } = useNDK();
  const { serverInfo } = useServerInfo();
  const queryClient = useQueryClient();
  const [transfers, setTransfers] = useState<{ [key: string]: TransferStats }>({});
  const [files, setFiles] = useState<File[]>([]);
  const [cleanPrivateData, setCleanPrivateData] = useState(true);

  const upload = async () => {
    const filesToUpload: File[] = [];
    for (const f of files) {
      if (cleanPrivateData) {
        filesToUpload.push(await removeExifData(f));
      } else {
        filesToUpload.push(f);
      }
    }

    if (filesToUpload && filesToUpload.length) {
      // sum files sizes
      const totalSize = filesToUpload.reduce((acc, f) => acc + f.size, 0);

      // set all entries size to totalSize
      setTransfers(ut => {
        const newTransfers = { ...ut };
        for (const server of servers) {
          if (newTransfers[server.name].enabled) {
            newTransfers[server.name].size = totalSize;
          }
        }
        return newTransfers;
      });

      for (const server of servers) {
        if (!transfers[server.name]?.enabled) {
          continue;
        }
        const serverUrl = serverInfo[server.name].url;
        for (const file of filesToUpload) {
          const uploadAuth = await BlossomClient.getUploadAuth(file, signEventTemplate, 'Upload Blob');
          const newBlob = await BlossomClient.uploadBlob(serverUrl, file, uploadAuth);

          transfers[server.name].transferred += file.size;
          console.log(newBlob);
        }
        queryClient.invalidateQueries({ queryKey: ['blobs', server.name] });
        setFiles([]);
      }
    }
  };

  const clearTransfers = () => {
    setTransfers(servers.reduce((acc, s) => ({ ...acc, [s.name]: { enabled: true, size: 0, transferred: 0 } }), {}));
  };

  useEffect(() => {
    clearTransfers();
  }, [servers]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const newFiles = Array.from(selectedFiles);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const newFiles = Array.from(droppedFiles);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
    }
  };

  return (
    <>
      <h2>Upload</h2>
      <div className=" bg-neutral-800 rounded-xl p-4 text-neutral-400 gap-4 flex flex-col">
        <input id="browse" type="file" hidden multiple onChange={handleFileChange} />
        <label
          htmlFor="browse"
          className="p-8 bg-neutral-700 rounded-lg hover:text-white text-neutral-400 border-dashed  border-neutral-500 border-2 block cursor-pointer text-center"
          onDrop={handleDrop}
          onDragOver={event => event.preventDefault()}
        >
          <ArrowUpOnSquareIcon className="w-8 inline" /> Browse or drag & drop
        </label>

        <div className="cursor-pointer grid gap-2" style={{ gridTemplateColumns: '1.5em 20em auto' }}>
          {servers.map(s => (
            <>
              <input
                className="w-5 accent-pink-700 hover:accent-pink-600"
                id={s.name}
                type="checkbox"
                checked={transfers[s.name]?.enabled || false}
                onChange={e =>
                  setTransfers(ut => ({ ...ut, [s.name]: { enabled: e.target.checked, transferred: 0, size: 0 } }))
                }
              />
              <label htmlFor={s.name} className="cursor-pointer">
                {s.name}
              </label>
              {transfers[s.name]?.enabled ? (
                <ProgressBar value={transfers[s.name].transferred} max={transfers[s.name].size} />
              ) : (
                <div></div>
              )}
            </>
          ))}
        </div>

        <div className="cursor-pointer grid gap-2" style={{ gridTemplateColumns: '1.5em 20em' }}>
          <input
            className="w-5 accent-pink-700 hover:accent-pink-600"
            id="cleanData"
            type="checkbox"
            checked={cleanPrivateData}
            onChange={e => setCleanPrivateData(e.currentTarget.checked)}
          />
          <label htmlFor="cleanData" className="cursor-pointer">
            Clean private data in images (EXIF)
          </label>
        </div>
        <button
          className="p-2 px-4  bg-neutral-600 hover:bg-pink-700 text-white rounded-lg w-2/6"
          onClick={() => upload()}
        >
          Upload{files.length > 0 ? (files.length == 1 ? ` 1 file` : ` ${files.length} files`) : ''}
        </button>
      </div>
    </>
  );
}

export default Upload;
