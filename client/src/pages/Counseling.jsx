import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import CounselingComponent from '@/components/counseling/Counseling'

export default function Counseling() {
    return (
        <div className="flex flex-col min-h-screen bg-background">
            <Navbar />
            <main className="flex-1 px-4 sm:px-6 lg:px-8 py-12 max-w-6xl mx-auto w-full">
                <div className="mb-10 text-center">
                    <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
                        Book a <span className="gradient-text">Counseling Session</span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Connect with professional mental health counselors for personalized support and guidance.
                    </p>
                </div>
                <CounselingComponent />
            </main>
            <Footer />
        </div>
    )
}
