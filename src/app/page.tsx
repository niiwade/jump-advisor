import Image from "next/image";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center w-full">

        <div className="text-6xl font-semibold tracking-tight text-center w-full"> 
        Jump Advisor Challenge
        </div>
 

        <div className="flex gap-4 items-center justify-center w-full">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-blue-600 text-white gap-2 hover:bg-blue-700 font-medium text-base sm:text-lg h-12 sm:h-14 px-6 sm:px-8 mx-auto shadow-md"
            href="/login"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={20}
              height={20}
            />
           Test the app
          </a>
    
        </div>
      </main>
    
    </div>
  );
}
