import { useRouter } from "next/router";
import { useState } from "react";

const Login = () => {
    const [selectedOption, setSelectedOption] = useState<"records" | "verifier" | null>(null);
    const [userDetails, setUserDetails] = useState({ name: "", email: "" });
    const [isFormVisible, setIsFormVisible] = useState(false);
    const router = useRouter();

    const handleOptionClick = (option: "records" | "verifier") => {
        setSelectedOption(option);
        setIsFormVisible(true);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setUserDetails((prevDetails) => ({
            ...prevDetails,
            [name]: value,
        }));
    };

    const handleSubmit = () => {
        const user = {
            ...userDetails,
            access: selectedOption,
        };

        localStorage.setItem("user", JSON.stringify(user));

        if (selectedOption === "verifier") {
            router.push("/");
        } else {
            router.push("/");
        }
    };

    return (
        <div className="text-center mt-12">
            <h1 className="text-3xl font-bold">Welcome</h1>
            {!selectedOption && !isFormVisible && (
                <>
                    <p className="mt-4 text-lg">What are you here for?</p>
                    <div className="mt-6">
                        <button
                            onClick={() => handleOptionClick("records")}
                            className="bg-blue-500 text-white px-4 py-2 rounded-md mx-2 hover:bg-blue-600"
                        >
                            To Add New Records
                        </button>
                        <button
                            onClick={() => handleOptionClick("verifier")}
                            className="bg-red-500 text-white px-4 py-2 rounded-md mx-2 hover:bg-red-600"
                        >
                            To Verify Summaries
                        </button>
                    </div>
                </>
            )}
            {isFormVisible && (
                <div className="mt-8">
                    <h2 className="text-2xl font-semibold">Enter Your Details</h2>
                    <div className="mt-4">
                        <input
                            type="text"
                            name="name"
                            placeholder="Enter your name"
                            value={userDetails.name}
                            onChange={handleInputChange}
                            className="block w-4/5 mx-auto p-2 border border-gray-300 rounded-md mb-4"
                        />
                        <input
                            type="email"
                            name="email"
                            placeholder="Enter your email"
                            value={userDetails.email}
                            onChange={handleInputChange}
                            className="block w-4/5 mx-auto p-2 border border-gray-300 rounded-md mb-4"
                        />
                        <div className="flex justify-center mt-6">
                            <button
                                onClick={() => {
                                    setIsFormVisible(false);
                                    setSelectedOption(null);
                                }}
                                className="bg-gray-500 text-white px-4 py-2 rounded-md mx-2 hover:bg-gray-600"
                            >
                                Go Back
                            </button>
                            <button
                                onClick={handleSubmit}
                                className="bg-blue-500 text-white px-4 py-2 rounded-md mx-2 hover:bg-blue-600"
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Login;